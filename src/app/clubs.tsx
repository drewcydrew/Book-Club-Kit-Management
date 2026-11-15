import React, { useState } from "react";
import { Text } from "react-native";
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

export default function Clubs() {
  const { data } = useStore();
  const shared = useShared();
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

  function edit(value: Club) {
    setClub(value);
    setClubRevision(
      value.id
        ? (shared.data.clubs.find((item) => item.id === value.id)?.revision ??
            null)
        : null,
    );
    setSize(String(value.size));
    setMembershipDraft(
      data.memberships.filter((membership) => membership.clubId === value.id),
    );
    setHistoryDraft([...value.history]);
    setMessage("");
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
        setClub((currentClub) => ({ ...currentClub, membershipRevision }));
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
                return (
                  <Actions key={link.kitId}>
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
        <Card>
          <Label>{club.id ? "Edit shared club" : "Add shared club"}</Label>
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
            <Action tone="primary" title="Save club" onPress={save} />
            <Action
              title="Clear club form"
              onPress={() => edit(blankClub(data.library.branches[0] ?? ""))}
            />
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
                  <Action
                    key={title.id}
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
        </Card>
      )}
      {message && !staff ? <Text>{message}</Text> : null}
    </Page>
  );
}
