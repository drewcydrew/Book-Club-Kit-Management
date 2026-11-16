import { usePreventRemove } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigationGuard } from "../components/navigation-guard";
import { TitleCover } from "../components/title-cover";
import {
  Action,
  Actions,
  Card,
  Field,
  Label,
  Note,
  Page,
} from "../components/ui";
import type { Club, Membership } from "../domain/model";
import {
  deleteRecord,
  saveHistory,
  saveMemberships,
  saveRecord,
  setClubKit,
} from "../state/api";
import { useShared } from "../state/shared";
import { useStore } from "../state/store";

const blankClub = (branch: string): Club => ({
  id: "",
  name: "",
  branch,
  leaderId: "",
  size: 1,
  cadence: "Monthly",
  pickup: "pickup",
  address: "",
  history: [],
  revision: 0,
  membershipRevision: 0,
});

function snapshot(
  value: Club,
  sizeText: string,
  members: Membership[],
  history: string[],
) {
  return JSON.stringify({ value, sizeText, members, history });
}

export default function Clubs() {
  const { data } = useStore();
  const shared = useShared();
  const navigationGuard = useNavigationGuard();
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const staff = person?.role === "admin" || person?.role === "staff";
  const [club, setClub] = useState<Club>(() =>
    blankClub(data.library.branches[0] ?? ""),
  );
  const [size, setSize] = useState("1");
  const [message, setMessage] = useState("");
  const [clubRevision, setClubRevision] = useState<number | null>(null);
  const [membershipDraft, setMembershipDraft] = useState<Membership[]>([]);
  const [historyDraft, setHistoryDraft] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<{
    id: string;
    name: string;
    revision: number;
  } | null>(null);
  const [unlinking, setUnlinking] = useState<{
    clubId: string;
    kitId: string;
  } | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [initial, setInitial] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<
    (() => void) | null
  >(null);
  const dirty =
    formOpen &&
    snapshot(club, size, membershipDraft, historyDraft) !== initial;
  const busy = shared.saving;

  const disablePrevention = usePreventRemove(
    dirty || (formOpen && busy),
    ({ repeat }) => {
      if (busy) {
        setMessage("Wait for the shared change to finish before leaving.");
        return;
      }
      setPendingNavigation(() => repeat);
      setConfirmDiscard(true);
    },
  );

  useEffect(() => {
    if (!formOpen || (!dirty && !busy)) return;
    return navigationGuard.register((continueNavigation) => {
      if (busy) {
        setMessage("Wait for the shared change to finish before leaving.");
        return;
      }
      setPendingNavigation(() => () => {
        disablePrevention();
        continueNavigation();
      });
      setConfirmDiscard(true);
    });
  }, [busy, dirty, disablePrevention, formOpen, navigationGuard]);

  function edit(value: Club) {
    const sizeText = String(value.size);
    const members = data.memberships.filter(
      (membership) => membership.clubId === value.id,
    );
    const history = [...value.history];
    setClub(value);
    setClubRevision(
      value.id
        ? (shared.data.clubs.find((item) => item.id === value.id)?.revision ??
            null)
        : null,
    );
    setSize(sizeText);
    setMembershipDraft(members);
    setHistoryDraft(history);
    setMessage("");
    setInitial(snapshot(value, sizeText, members, history));
    setConfirmDiscard(false);
    setPendingNavigation(null);
    setFormOpen(true);
  }

  function closeForm() {
    if (busy) return;
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    setFormOpen(false);
  }

  function discardForm() {
    const navigate = pendingNavigation;
    setFormOpen(false);
    setConfirmDiscard(false);
    setPendingNavigation(null);
    if (navigate) navigate();
  }

  function save() {
    const count = Number(size);
    if (
      !club.name.trim() ||
      !club.branch.trim() ||
      !Number.isInteger(count) ||
      count < 1 ||
      (club.pickup === "delivery" && !club.address.trim())
    ) {
      setMessage(
        "Enter a club name, branch, positive size and delivery address if applicable.",
      );
      return;
    }
    const {
      leaderId: _leaderId,
      history: _history,
      membershipRevision: _membershipRevision,
      revision,
      ...fields
    } = club;
    const value = {
      ...fields,
      name: club.name.trim(),
      branch: club.branch.trim(),
      size: count,
      ...(clubRevision === null ? {} : { revision }),
    };
    void shared
      .mutate(() => saveRecord("clubs", value))
      .then((saved) => {
        if (!("pickup" in saved))
          throw new Error("Server returned an invalid club.");
        const current: Club = {
          ...saved,
          leaderId: club.leaderId,
          history: club.history,
          membershipRevision: club.membershipRevision,
        };
        setClub(current);
        setClubRevision(saved.revision);
        setSize(String(saved.size));
        setInitial(
          snapshot(current, String(saved.size), membershipDraft, historyDraft),
        );
        setMessage(
          "Shared club saved. Membership, leadership and reading history are managed separately.",
        );
      })
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error ? error.message : "Unable to save club.",
        ),
      );
  }

  function saveMembers() {
    const current = shared.data.clubs.find((item) => item.id === club.id);
    if (!current) {
      setMessage("Save this club before managing its members.");
      return;
    }
    const selected = membershipDraft.filter(
      (membership) => membership.clubId === club.id,
    );
    if (selected.filter((membership) => membership.leader).length > 1) {
      setMessage("A club can have only one leader.");
      return;
    }
    void shared
      .mutate(() => saveMemberships(club.id, selected, club.membershipRevision))
      .then((membershipRevision) => {
        const nextClub = { ...club, membershipRevision };
        setClub(nextClub);
        setInitial(snapshot(nextClub, size, membershipDraft, historyDraft));
        setMessage("Shared memberships and club leadership saved.");
      })
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to save memberships.",
        ),
      );
  }

  function saveClubHistory() {
    const current = shared.data.clubs.find((item) => item.id === club.id);
    if (!current) {
      setMessage(
        "Club is no longer available. Refresh before editing history.",
      );
      return;
    }
    void shared
      .mutate(() => saveHistory(club.id, historyDraft, club.revision))
      .then((revision) => {
        setClub((currentClub) => ({
          ...currentClub,
          history: historyDraft,
          revision,
        }));
        setClubRevision(revision);
        const nextClub = { ...club, history: historyDraft, revision };
        setInitial(snapshot(nextClub, size, membershipDraft, historyDraft));
        setMessage("Shared club reading history saved.");
      })
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to save reading history.",
        ),
      );
  }

  const visibleClubs = data.clubs.filter(
    (value) =>
      staff ||
      data.memberships.some(
        (membership) =>
          membership.personId === person?.id && membership.clubId === value.id,
      ),
  );

  return (
    <Page title="Clubs">
      <Actions>
        <Action
          title="Refresh shared clubs and memberships"
          onPress={() => {
            void shared.refresh().catch(() => undefined);
          }}
        />
        {staff && (
          <Action
            tone="primary"
            title="Add club"
            onPress={() => edit(blankClub(data.library.branches[0] ?? ""))}
          />
        )}
      </Actions>
      <Note>
        Clubs, membership, leadership, reading history and kit links are shared.
        Kit links do not mean kits are checked out. Roles and leader controls
        are interface-only; the API is publicly writable.
      </Note>
      {data.clubs.length === 0 && (
        <Note>
          No shared clubs yet. Staff can create one, or an administrator can run
          the explicit demo seed.
        </Note>
      )}
      {deleting && (
        <Card>
          <Label>Delete {deleting.name}?</Label>
          <Note>
            Deletion is blocked while any shared membership, cycle, schedule,
            history or kit link refers to this club.
          </Note>
          <Actions>
            <Action
              tone="danger"
              title="Confirm deletion"
              onPress={() => {
                void shared
                  .mutate(() =>
                    deleteRecord("clubs", deleting.id, deleting.revision),
                  )
                  .then(() => {
                    setDeleting(null);
                    setMessage("Club deleted.");
                  })
                  .catch((error: unknown) =>
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "Unable to delete club.",
                    ),
                  );
              }}
            />
            <Action title="Cancel deletion" onPress={() => setDeleting(null)} />
          </Actions>
        </Card>
      )}
      {unlinking && (
        <Card>
          <Label>Remove this shared kit link?</Label>
          <Actions>
            <Action
              tone="danger"
              title="Confirm unlink"
              onPress={() => {
                void shared
                  .mutate(() =>
                    setClubKit(unlinking.clubId, unlinking.kitId, false),
                  )
                  .then(() => {
                    setUnlinking(null);
                    setMessage("Kit unlinked.");
                  })
                  .catch((error: unknown) =>
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "Unable to unlink kit.",
                    ),
                  );
              }}
            />
            <Action title="Cancel unlink" onPress={() => setUnlinking(null)} />
          </Actions>
        </Card>
      )}
      {visibleClubs.map((value) => {
        const members = data.memberships.filter(
          (membership) => membership.clubId === value.id,
        );
        return (
          <Card key={value.id}>
            <Label>{value.name}</Label>
            <Note>
              {value.branch} · {value.size} members · {value.cadence} ·{" "}
              {value.pickup}
            </Note>
            {value.pickup === "delivery" ? <Text>{value.address}</Text> : null}
            <Text>
              Leader:{" "}
              {data.people.find((p) => p.id === value.leaderId)?.name ??
                "Not assigned"}
            </Text>
            <Text>
              Members:{" "}
              {members
                .map(
                  (membership) =>
                    `${data.people.find((p) => p.id === membership.personId)?.name ?? "Unavailable user"}${membership.leader ? " (leader)" : ""}`,
                )
                .join(", ") || "None"}
            </Text>
            <Text>
              Previously read:{" "}
              {value.history
                .map(
                  (titleId) =>
                    data.titles.find((t) => t.id === titleId)?.name ??
                    `${titleId} (unavailable)`,
                )
                .join(", ") || "None"}
            </Text>
            <Label>Linked kits</Label>
            {shared.data.links
              .filter((link) => link.clubId === value.id)
              .map((link) => {
                const kit = data.kits.find((item) => item.id === link.kitId);
                const linkedTitle = kit ? data.titles.find((title) => title.id === kit.titleId) : undefined;
                return (
                  <Actions key={link.kitId}>
                    {linkedTitle && <TitleCover titleId={linkedTitle.id} isbn={linkedTitle.isbn} />}
                    <Text>
                      {kit
                        ? `${kit.barcode} · ${data.titles.find((title) => title.id === kit.titleId)?.name ?? "Title unavailable"}`
                        : "Kit unavailable"}
                    </Text>
                    {staff && (
                      <Action
                        tone="danger"
                        title={`Unlink ${kit?.barcode ?? link.kitId}`}
                        onPress={() => setUnlinking(link)}
                      />
                    )}
                  </Actions>
                );
              })}
            {staff && (
              <>
                <Note>Link a kit:</Note>
                <Actions>
                  {data.kits
                    .filter(
                      (kit) =>
                        !shared.data.links.some(
                          (link) =>
                            link.clubId === value.id && link.kitId === kit.id,
                        ),
                    )
                    .map((kit) => (
                      <Action
                        key={kit.id}
                        title={`Link ${kit.barcode}`}
                        onPress={() => {
                          void shared
                            .mutate(() => setClubKit(value.id, kit.id, true))
                            .then(() => setMessage("Shared kit link saved."))
                            .catch((error: unknown) =>
                              setMessage(
                                error instanceof Error
                                  ? error.message
                                  : "Unable to link kit.",
                              ),
                            );
                        }}
                      />
                    ))}
                </Actions>
                <Actions>
                  <Action title="Edit club" onPress={() => edit(value)} />
                  <Action
                    tone="danger"
                    title="Delete club"
                    onPress={() => {
                      const record = shared.data.clubs.find(
                        (item) => item.id === value.id,
                      );
                      if (record)
                        setDeleting({
                          id: record.id,
                          name: record.name,
                          revision: record.revision,
                        });
                    }}
                  />
                </Actions>
              </>
            )}
          </Card>
        );
      })}
      {staff && (
        <Modal
          transparent
          visible={formOpen}
          onRequestClose={
            confirmDiscard
              ? () => {
                  setConfirmDiscard(false);
                  setPendingNavigation(null);
                }
              : closeForm
          }
          accessibilityLabel={club.id ? "Edit shared club" : "Add shared club"}
        >
          <KeyboardAvoidingView
            style={modalStyles.backdrop}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={modalStyles.dialog}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={modalStyles.content}
              >
                {confirmDiscard ? (
                  <>
                    <Label>Discard unsaved changes?</Label>
                    <Note>Your changes have not been saved.</Note>
                    <Actions>
                      <Action
                        tone="danger"
                        title="Discard changes"
                        onPress={discardForm}
                      />
                      <Action
                        title="Keep editing"
                        onPress={() => {
                          setConfirmDiscard(false);
                          setPendingNavigation(null);
                        }}
                      />
                    </Actions>
                  </>
                ) : (
                  <>
                    <Label>
                      {club.id ? "Edit shared club" : "Add shared club"}
                    </Label>
          <Field
            label="Club name"
            value={club.name}
            onChangeText={(name) => setClub({ ...club, name })}
          />
          <Field
            label="Branch"
            value={club.branch}
            onChangeText={(branch) => setClub({ ...club, branch })}
          />
          <Field label="Club size" value={size} onChangeText={setSize} />
          <Field
            label="Meeting cadence"
            value={club.cadence}
            onChangeText={(cadence) => setClub({ ...club, cadence })}
          />
          <Action
            title={`Method: ${club.pickup}`}
            onPress={() =>
              setClub({
                ...club,
                pickup: club.pickup === "pickup" ? "delivery" : "pickup",
              })
            }
          />
          {club.pickup === "delivery" && (
            <Field
              label="Fictional delivery address"
              value={club.address}
              onChangeText={(address) => setClub({ ...club, address })}
            />
          )}
          <Actions>
            <Action
              tone="primary"
              title="Save club"
              disabled={busy}
              onPress={save}
            />
            <Action title="Cancel" disabled={busy} onPress={closeForm} />
          </Actions>
          {!!club.id && (
            <>
              <Label>Shared club membership and leader</Label>
              <Note>Memberships with saved ballots cannot be removed.</Note>
              {data.people.length === 0 && (
                <Note>Create demo users in Settings first.</Note>
              )}
              {data.people.map((member) => {
                const current = membershipDraft.find(
                  (entry) =>
                    entry.clubId === club.id && entry.personId === member.id,
                );
                const others = membershipDraft.filter(
                  (entry) => entry.personId !== member.id,
                );
                return (
                  <Actions key={member.id}>
                    <Action
                      selected={!!current}
                      title={`${current ? "✓ " : ""}${member.name} (${member.role})`}
                      onPress={() =>
                        setMembershipDraft(
                          current
                            ? others
                            : [
                                ...others,
                                {
                                  personId: member.id,
                                  clubId: club.id,
                                  leader: false,
                                },
                              ],
                        )
                      }
                    />
                    {current && (
                      <Action
                        selected={current.leader}
                        title={
                          current.leader ? "Club leader ✓" : "Make club leader"
                        }
                        onPress={() =>
                          setMembershipDraft([
                            ...membershipDraft
                              .filter((entry) => entry.personId !== member.id)
                              .map((entry) => ({ ...entry, leader: false })),
                            { ...current, leader: !current.leader },
                          ])
                        }
                      />
                    )}
                  </Actions>
                );
              })}
              <Action
                tone="primary"
                title="Save shared memberships and leader"
                onPress={saveMembers}
              />
              <Label>Shared reading history</Label>
              <Actions>
                {data.titles.map((title) => (
                  <View key={title.id} style={{ flexDirection: "row", alignItems: "center" }}>
                    <TitleCover titleId={title.id} isbn={title.isbn} />
                    <Action
                      selected={historyDraft.includes(title.id)}
                      title={`${title.name}${historyDraft.includes(title.id) ? " ✓" : ""}`}
                      onPress={() =>
                        setHistoryDraft(
                          historyDraft.includes(title.id)
                            ? historyDraft.filter((id) => id !== title.id)
                            : [...historyDraft, title.id],
                        )
                      }
                    />
                  </View>
                ))}
              </Actions>
              <Action
                tone="primary"
                title="Save shared reading history"
                onPress={saveClubHistory}
              />
            </>
          )}
                {message ? <Text>{message}</Text> : null}
                  </>
                )}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
      {message && !formOpen ? <Text>{message}</Text> : null}
    </Page>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  dialog: {
    width: "100%",
    maxWidth: 650,
    maxHeight: "90%",
    backgroundColor: "#fffefa",
  },
  content: { padding: 20, gap: 12 },
});
