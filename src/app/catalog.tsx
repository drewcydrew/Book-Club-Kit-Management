import { usePreventRemove } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KitLabelManager } from "../components/kit-label-manager";
import { useNavigationGuard } from "../components/navigation-guard";
import {
  PendingStatus,
  type PendingAction,
} from "../components/pending-status";
import { TitlePanel } from "../components/title-panel";
import { TitlePicker } from "../components/title-picker";
import { Action, Actions, Field, Label, Note, Page } from "../components/ui";
import type { Kit, Title } from "../domain/model";
import {
  ApiError,
  deleteRecord,
  lookupIsbn,
  saveRecord,
  searchIsbns,
  type IsbnLookup,
  type TitleSearchResult,
} from "../state/api";
import { saveCatalogChange } from "../state/catalog-save";
import { useShared } from "../state/shared";
import { ScreenGate } from "../components/screen-gate";
import { useStore } from "../state/store";

const blankTitle = (): Title => ({
  id: "",
  name: "",
  author: "",
  isbn: "",
  pages: 0,
  genres: "",
  labelIds: [],
  notes: "",
  largePrint: false,
  audio: false,
  coverUrl: null,
  publisher: null,
  synopsis: null,
  datePublished: null,
  binding: null,
  language: null,
});
const blankKit = (branch: string): Kit => ({
  id: "",
  titleId: "",
  barcode: "",
  branch,
  copies: 1,
  extras: "",
  components: [],
  status: "available",
  labelIds: [],
});

type TitleDraft = {
  kind: "title";
  value: Title;
  pages: string;
  revision: number | null;
};
type KitDraft = {
  kind: "kit";
  value: Kit;
  copies: string;
  components: string;
  revision: number | null;
};
type Draft = TitleDraft | KitDraft;

function titleDraft(value: Title, revision: number | null): TitleDraft {
  return {
    kind: "title",
    value,
    pages: value.pages ? String(value.pages) : "",
    revision,
  };
}
function kitDraft(value: Kit, revision: number | null): KitDraft {
  return {
    kind: "kit",
    value,
    copies: String(value.copies),
    components: value.components.join(", "),
    revision,
  };
}

type LookupStatus = "loading" | "found" | "none" | "invalid" | "error";

function lookupMessage(status: LookupStatus): string {
  switch (status) {
    case "loading":
      return "Looking up book details…";
    case "found":
      return "Filled in from ISBNdb. Check the details before saving.";
    case "none":
      return "No book found for this ISBN. Enter the details manually.";
    case "invalid":
      return "Enter a valid ISBN-10 or ISBN-13 to look up the book.";
    case "error":
      return "Book lookup is unavailable right now. Enter the details manually.";
  }
}

type TitleSearchStatus = "loading" | "done" | "none" | "invalid" | "error";

function titleSearchMessage(status: TitleSearchStatus, count: number): string {
  switch (status) {
    case "loading":
      return "Searching ISBNdb…";
    case "done":
      return `${count} match${count === 1 ? "" : "es"}. The first is used for details; tap another to switch.`;
    case "none":
      return "No ISBNs found for that title.";
    case "invalid":
      return "Enter a title to search.";
    case "error":
      return "Title search is unavailable right now.";
  }
}

// Fills only empty fields so that text the user has already typed is never replaced.
function applyLookup(draft: TitleDraft, found: IsbnLookup): TitleDraft {
  const { value } = draft;
  const fillEmpty = (
    current: string | null | undefined,
    fromLookup: string | null,
  ) => (current?.trim() ? current : (fromLookup ?? null));
  return {
    ...draft,
    pages:
      draft.pages.trim() || found.pages === null
        ? draft.pages
        : String(found.pages),
    value: {
      ...value,
      name: value.name.trim() ? value.name : (found.title ?? ""),
      author: value.author.trim() ? value.author : (found.author ?? ""),
      genres: value.genres.trim() ? value.genres : (found.genres ?? ""),
      coverUrl: value.coverUrl ?? found.coverUrl,
      publisher: fillEmpty(value.publisher, found.publisher),
      synopsis: fillEmpty(value.synopsis, found.synopsis),
      datePublished: fillEmpty(value.datePublished, found.datePublished),
      binding: fillEmpty(value.binding, found.binding),
      language: fillEmpty(value.language, found.language),
    },
  };
}

export default function Catalog() {
  return <ScreenGate staffOnly><CatalogContent /></ScreenGate>;
}

function CatalogContent() {
  const { data } = useStore();
  const shared = useShared();
  const navigationGuard = useNavigationGuard();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [initial, setInitial] = useState("");
  const [pendingIsbn, setPendingIsbn] = useState("");
  const [preview, setPreview] = useState<{
    isbn: string;
    status: LookupStatus;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [isbnTitleQuery, setIsbnTitleQuery] = useState("");
  const [titleSearch, setTitleSearch] = useState<{
    status: TitleSearchStatus;
    results: TitleSearchResult[];
  } | null>(null);
  const [formError, setFormError] = useState("");
  const [recovery, setRecovery] = useState<"conflict" | "uncertain" | null>(
    null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const [pendingNavigation, setPendingNavigation] = useState<
    (() => void) | null
  >(null);
  const saving = useRef(false);
  const [deleting, setDeleting] = useState<{
    kind: "titles" | "kits";
    id: string;
    revision: number;
    name: string;
  } | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [pending, setPending] = useState<{
    kind: "titles" | "kits";
    id: string;
    action: PendingAction;
  } | null>(null);
  const pendingFor = (
    kind: "titles" | "kits",
    id: string,
  ): PendingAction | null =>
    pending?.kind === kind && pending.id === id ? pending.action : null;
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const staff = person?.role === "staff" || person?.role === "admin";
  const dirty = draft !== null && JSON.stringify(draft) !== initial;
  const busy = shared.saving || refreshing;

  const disablePrevention = usePreventRemove(
    dirty || (draft !== null && busy),
    ({ repeat }) => {
      if (busy) {
        setFormError("Wait for the shared change to finish before leaving.");
        return;
      }
      setPendingNavigation(() => repeat);
      setConfirmDiscard(true);
    },
  );

  useEffect(() => {
    if (!draft || (!dirty && !busy)) return;
    return navigationGuard.register((continueNavigation) => {
      if (busy) {
        setFormError("Wait for the shared change to finish before leaving.");
        return;
      }
      setPendingNavigation(() => () => {
        disablePrevention();
        continueNavigation();
      });
      setConfirmDiscard(true);
    });
  }, [busy, dirty, disablePrevention, draft, navigationGuard]);

  useEffect(() => {
    if (!pendingIsbn) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setPreview({ isbn: pendingIsbn, status: "loading" });
      lookupIsbn(pendingIsbn)
        .then((found) => {
          if (cancelled) return;
          setPreview({ isbn: pendingIsbn, status: "found" });
          // Only fill the form while it still holds this ISBN.
          setDraft((current) =>
            current?.kind === "title" &&
            current.value.isbn.trim() === pendingIsbn
              ? applyLookup(current, found)
              : current,
          );
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          const status: LookupStatus =
            error instanceof ApiError && error.status === 404
              ? "none"
              : error instanceof ApiError && error.status === 400
                ? "invalid"
                : "error";
          setPreview({ isbn: pendingIsbn, status });
        });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pendingIsbn]);

  function open(next: Draft) {
    setDraft(next);
    setInitial(JSON.stringify(next));
    setPendingIsbn("");
    setPreview(null);
    setIsbnTitleQuery("");
    setTitleSearch(null);
    setFormError("");
    setRecovery(null);
    setConfirmDiscard(false);
    setPendingNavigation(null);
    setMessage("");
  }
  function changeIsbn(isbn: string) {
    if (!draft || draft.kind !== "title") return;
    const trimmed = isbn.trim();
    const changed = trimmed !== draft.value.isbn.trim();
    // A cover belongs to one ISBN, so editing the ISBN drops the previous cover until a new preview arrives.
    setDraft({
      ...draft,
      value: {
        ...draft.value,
        isbn,
        coverUrl: changed ? null : draft.value.coverUrl,
      },
    });
    if (!changed) return;
    setPendingIsbn(trimmed);
    setPreview(trimmed ? { isbn: trimmed, status: "loading" } : null);
  }

  // Uses a functional update because a title search resolves after the user may have edited other fields.
  function selectTitleIsbn(isbn: string) {
    const trimmed = isbn.trim();
    if (
      !trimmed ||
      (draft?.kind === "title" && draft.value.isbn.trim() === trimmed)
    )
      return;
    setDraft((current) =>
      current?.kind === "title"
        ? {
            ...current,
            value: { ...current.value, isbn: trimmed, coverUrl: null },
          }
        : current,
    );
    setPendingIsbn(trimmed);
    setPreview({ isbn: trimmed, status: "loading" });
  }

  async function searchTitle() {
    const query = isbnTitleQuery.trim();
    if (!query) {
      setTitleSearch({ status: "invalid", results: [] });
      return;
    }
    setTitleSearch({ status: "loading", results: [] });
    try {
      const results = await searchIsbns(query);
      setTitleSearch({ status: "done", results });
      selectTitleIsbn(results[0].isbn);
    } catch (error: unknown) {
      const status: TitleSearchStatus =
        error instanceof ApiError && error.status === 404
          ? "none"
          : error instanceof ApiError && error.status === 400
            ? "invalid"
            : "error";
      setTitleSearch({ status, results: [] });
    }
  }

  function close() {
    if (busy || saving.current) return;
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    setDraft(null);
  }
  function discard() {
    const navigate = pendingNavigation;
    setDraft(null);
    setConfirmDiscard(false);
    setPendingNavigation(null);
    if (navigate) navigate();
  }

  async function save() {
    if (!draft || saving.current || shared.saving || recovery) return;
    setFormError("");
    try {
      let operation: () => Promise<unknown>;
      if (draft.kind === "title") {
        const pages = draft.pages.trim() ? Number(draft.pages) : 0;
        if (
          !draft.value.name.trim() ||
          !draft.value.author.trim() ||
          !Number.isInteger(pages) ||
          pages < 0
        ) {
          setFormError(
            "Enter a title, author and a nonnegative whole page count.",
          );
          return;
        }
        const value = {
          ...draft.value,
          name: draft.value.name.trim(),
          author: draft.value.author.trim(),
          pages,
          ...(draft.revision === null ? {} : { revision: draft.revision }),
        };
        operation = () => saveRecord("titles", value);
      } else {
        const copies = Number(draft.copies);
        const components = draft.components
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        if (
          !draft.value.titleId ||
          !draft.value.barcode.trim() ||
          !draft.value.branch.trim() ||
          !Number.isInteger(copies) ||
          copies < 1 ||
          components.length > copies
        ) {
          setFormError(
            "Select a title, enter a barcode and branch, and use a positive copy count at least as large as the component list.",
          );
          return;
        }
        const old = data.kits.find((item) => item.id === draft.value.id);
        if (
          old &&
          old.titleId !== draft.value.titleId &&
          data.assignments.some((item) => item.kitId === draft.value.id)
        ) {
          setFormError(
            "Cannot change the title of a kit referenced by a shared schedule.",
          );
          return;
        }
        const { status: _status, labelIds: _labelIds, ...fields } = draft.value;
        const value = {
          ...fields,
          barcode: draft.value.barcode.trim(),
          branch: draft.value.branch.trim(),
          copies,
          components,
          ...(draft.revision === null ? {} : { revision: draft.revision }),
        };
        operation = () => saveRecord("kits", value);
      }
      saving.current = true;
      setPending({
        kind: draft.kind === "title" ? "titles" : "kits",
        id: draft.value.id,
        action: "Saving",
      });
      const result = await saveCatalogChange(shared.mutate, operation);
      if (!result.ok) {
        setFormError(result.message);
        setRecovery(result.recovery);
        return;
      }
      setDraft(null);
      setMessage(draft.kind === "title" ? "Title saved." : "Kit saved.");
    } finally {
      saving.current = false;
      setPending(null);
    }
  }

  function startDelete(value: {
    kind: "titles" | "kits";
    id: string;
    revision: number;
    name: string;
  }) {
    setDeleteError("");
    setDeleting(value);
  }

  function closeDelete() {
    if (shared.saving) return;
    setDeleting(null);
    setDeleteError("");
  }

  async function confirmDelete() {
    if (!deleting) return;
    setPending({ kind: deleting.kind, id: deleting.id, action: "Deleting" });
    try {
      await shared.mutate(() =>
        deleteRecord(deleting.kind, deleting.id, deleting.revision),
      );
      setDeleting(null);
      setMessage("Record deleted.");
    } catch (error: unknown) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : "Unable to delete this record.",
      );
    } finally {
      setPending(null);
    }
  }

  async function refreshAndReload() {
    if (!draft || busy) return;
    setRefreshing(true);
    try {
      await shared.refresh();
      // Refresh completes before React updates the shared context; reload is explicit below.
      setFormError(
        "Shared data refreshed. Close this form and reopen the record to review the latest version.",
      );
      setRecovery("uncertain");
    } catch (error: unknown) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to refresh shared data.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  function addTitle() {
    open(titleDraft(blankTitle(), null));
  }
  function addKit(titleId = "") {
    open(
      kitDraft({ ...blankKit(data.library.branches[0] ?? ""), titleId }, null),
    );
  }
  function editTitle(id: string) {
    const record = shared.data.titles.find((title) => title.id === id);
    const item = data.titles.find((title) => title.id === id);
    if (record && item) open(titleDraft(item, record.revision));
    else
      setMessage(
        "This title is no longer available. Refresh the shared catalog.",
      );
  }
  function deleteTitle(id: string) {
    const record = shared.data.titles.find((title) => title.id === id);
    if (record)
      startDelete({
        kind: "titles",
        id: record.id,
        revision: record.revision,
        name: record.name,
      });
  }
  function editKit(id: string) {
    const record = shared.data.kits.find((kit) => kit.id === id);
    const item = data.kits.find((kit) => kit.id === id);
    if (record && item) open(kitDraft(item, record.revision));
    else
      setMessage(
        "This kit is no longer available. Refresh the shared catalog.",
      );
  }
  function deleteKit(id: string) {
    const record = shared.data.kits.find((kit) => kit.id === id);
    if (record)
      startDelete({
        kind: "kits",
        id: record.id,
        revision: record.revision,
        name: record.barcode,
      });
  }

  const titlePanel = (
    <TitlePanel
      titles={data.titles}
      kits={data.kits}
      labels={data.kitLabels}
      query={query}
      onQueryChange={setQuery}
      staff={staff}
      saving={shared.saving}
      pendingTitleFor={(id) => pendingFor("titles", id)}
      pendingKitFor={(id) => pendingFor("kits", id)}
      onAddTitle={addTitle}
      onAddKit={addKit}
      onEdit={(title) => editTitle(title.id)}
      onDelete={(title) => deleteTitle(title.id)}
      onEditKit={(kit) => editKit(kit.id)}
      onDeleteKit={(kit) => deleteKit(kit.id)}
    />
  );

  return (
    <Page title="Catalog & kits">
      <Actions>
        <Action
          title="Refresh shared catalog"
          onPress={() => {
            void shared.refresh().catch(() => undefined);
          }}
        />
      </Actions>
      <Note>
        Titles, kits, kit status and circulation are shared across devices.
      </Note>
      {message ? <Text>{message}</Text> : null}
      {staff && <KitLabelManager labels={data.kitLabels} />}
      {titlePanel}
      {draft && (
        <Modal
          transparent
          visible
          onRequestClose={
            confirmDiscard
              ? () => {
                  setConfirmDiscard(false);
                  setPendingNavigation(null);
                }
              : close
          }
          accessibilityLabel={`${draft.value.id ? "Edit" : "Add"} ${draft.kind}`}
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
                        onPress={discard}
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
                      {draft.value.id
                        ? `Edit ${draft.kind}`
                        : `Add ${draft.kind}`}
                    </Label>
                    {draft.kind === "title" ? (
                      <>
                        <Field
                          editable={!shared.saving}
                          label="ISBN"
                          value={draft.value.isbn}
                          onChangeText={changeIsbn}
                        />
                        {preview && preview.isbn === draft.value.isbn.trim() ? (
                          <Note>{lookupMessage(preview.status)}</Note>
                        ) : null}
                        <Field
                          editable={!shared.saving}
                          label="Search by title"
                          value={isbnTitleQuery}
                          onChangeText={setIsbnTitleQuery}
                        />
                        <Actions>
                          <Action
                            title="Search ISBNdb"
                            disabled={
                              shared.saving || titleSearch?.status === "loading"
                            }
                            onPress={searchTitle}
                          />
                        </Actions>
                        {titleSearch ? (
                          <>
                            <Note>
                              {titleSearchMessage(
                                titleSearch.status,
                                titleSearch.results.length,
                              )}
                            </Note>
                            {titleSearch.results.map((result) => {
                              const year =
                                result.datePublished?.match(/^\d{4}/)?.[0];
                              const label = [
                                result.title,
                                result.author,
                                year,
                                result.isbn,
                              ]
                                .filter(Boolean)
                                .join(" · ");
                              return (
                                <Action
                                  key={result.isbn}
                                  title={label}
                                  selected={
                                    draft.value.isbn.trim() === result.isbn
                                  }
                                  onPress={() => selectTitleIsbn(result.isbn)}
                                />
                              );
                            })}
                          </>
                        ) : null}
                        {draft.value.coverUrl ? (
                          <Image
                            source={{ uri: draft.value.coverUrl }}
                            style={modalStyles.preview}
                            accessibilityLabel="Cover preview"
                            resizeMode="contain"
                          />
                        ) : null}
                        <Field
                          editable={!shared.saving}
                          label="Title"
                          value={draft.value.name}
                          onChangeText={(name) =>
                            setDraft({
                              ...draft,
                              value: { ...draft.value, name },
                            })
                          }
                        />
                        <Field
                          editable={!shared.saving}
                          label="Author"
                          value={draft.value.author}
                          onChangeText={(author) =>
                            setDraft({
                              ...draft,
                              value: { ...draft.value, author },
                            })
                          }
                        />
                        <Field
                          editable={!shared.saving}
                          label="Pages"
                          value={draft.pages}
                          onChangeText={(pages) =>
                            setDraft({ ...draft, pages })
                          }
                        />
                        <Field
                          editable={!shared.saving}
                          label="Source genres (e.g. ISBNdb)"
                          value={draft.value.genres}
                          onChangeText={(genres) =>
                            setDraft({
                              ...draft,
                              value: { ...draft.value, genres },
                            })
                          }
                        />
                        <Note>Controlled labels describe this title. Manage the shared lists on the catalog page.</Note>
                        {(["genre", "vibe"] as const).map((category) => (
                          <View key={category} style={{ gap: 6 }}>
                            <Label>{category === "genre" ? "Genres" : "Book-club vibes"}</Label>
                            {data.kitLabels.filter((label) => label.category === category).length === 0 ? (
                              <Note>No labels in this list yet.</Note>
                            ) : (
                              <Actions>
                                {data.kitLabels.filter((label) => label.category === category).map((label) => (
                                  <Action key={label.id} title={label.name} selected={draft.value.labelIds.includes(label.id)}
                                    disabled={shared.saving} onPress={() => setDraft({
                                      ...draft,
                                      value: { ...draft.value, labelIds: draft.value.labelIds.includes(label.id)
                                        ? draft.value.labelIds.filter((id) => id !== label.id)
                                        : [...draft.value.labelIds, label.id] },
                                    })} />
                                ))}
                              </Actions>
                            )}
                          </View>
                        ))}
                        <Field
                          editable={!shared.saving}
                          label="Publisher"
                          value={draft.value.publisher ?? ""}
                          onChangeText={(publisher) =>
                            setDraft({
                              ...draft,
                              value: { ...draft.value, publisher },
                            })
                          }
                        />
                        <Field
                          editable={!shared.saving}
                          label="Date published"
                          value={draft.value.datePublished ?? ""}
                          onChangeText={(datePublished) =>
                            setDraft({
                              ...draft,
                              value: { ...draft.value, datePublished },
                            })
                          }
                        />
                        <Field
                          editable={!shared.saving}
                          label="Binding"
                          value={draft.value.binding ?? ""}
                          onChangeText={(binding) =>
                            setDraft({
                              ...draft,
                              value: { ...draft.value, binding },
                            })
                          }
                        />
                        <Field
                          editable={!shared.saving}
                          label="Language"
                          value={draft.value.language ?? ""}
                          onChangeText={(language) =>
                            setDraft({
                              ...draft,
                              value: { ...draft.value, language },
                            })
                          }
                        />
                        <Field
                          editable={!shared.saving}
                          label="Synopsis"
                          multiline
                          value={draft.value.synopsis ?? ""}
                          onChangeText={(synopsis) =>
                            setDraft({
                              ...draft,
                              value: { ...draft.value, synopsis },
                            })
                          }
                        />
                        <Field
                          editable={!shared.saving}
                          label="Content notes"
                          value={draft.value.notes}
                          onChangeText={(notes) =>
                            setDraft({
                              ...draft,
                              value: { ...draft.value, notes },
                            })
                          }
                        />
                        <Actions>
                          <Action
                            disabled={shared.saving}
                            selected={draft.value.largePrint}
                            title={`Large print: ${draft.value.largePrint ? "yes" : "no"}`}
                            onPress={() =>
                              setDraft({
                                ...draft,
                                value: {
                                  ...draft.value,
                                  largePrint: !draft.value.largePrint,
                                },
                              })
                            }
                          />
                          <Action
                            disabled={shared.saving}
                            selected={draft.value.audio}
                            title={`Audio: ${draft.value.audio ? "yes" : "no"}`}
                            onPress={() =>
                              setDraft({
                                ...draft,
                                value: {
                                  ...draft.value,
                                  audio: !draft.value.audio,
                                },
                              })
                            }
                          />
                        </Actions>
                      </>
                    ) : (
                      <>
                        <Note>Select the title:</Note>
                        <TitlePicker
                          titles={data.titles}
                          selectedId={draft.value.titleId}
                          disabled={shared.saving}
                          onSelect={(titleId) =>
                            setDraft({
                              ...draft,
                              value: { ...draft.value, titleId },
                            })
                          }
                        />
                        {data.titles.length === 0 && (
                          <Note>Add a title before creating a kit.</Note>
                        )}
                        <Field
                          editable={!shared.saving}
                          label="Kit barcode"
                          value={draft.value.barcode}
                          onChangeText={(barcode) =>
                            setDraft({
                              ...draft,
                              value: { ...draft.value, barcode },
                            })
                          }
                        />
                        <Field
                          editable={!shared.saving}
                          label="Branch"
                          value={draft.value.branch}
                          onChangeText={(branch) =>
                            setDraft({
                              ...draft,
                              value: { ...draft.value, branch },
                            })
                          }
                        />
                        <Field
                          editable={!shared.saving}
                          label="Number of copies"
                          value={draft.copies}
                          onChangeText={(copies) =>
                            setDraft({ ...draft, copies })
                          }
                        />
                        <Field
                          editable={!shared.saving}
                          label="Extras"
                          value={draft.value.extras}
                          onChangeText={(extras) =>
                            setDraft({
                              ...draft,
                              value: { ...draft.value, extras },
                            })
                          }
                        />
                        <Field
                          editable={!shared.saving}
                          label="Copy barcodes (comma separated)"
                          value={draft.components}
                          onChangeText={(components) =>
                            setDraft({ ...draft, components })
                          }
                        />
                      </>
                    )}
                    {formError ? (
                      <Text accessibilityRole="alert" style={modalStyles.error}>
                        {formError}
                      </Text>
                    ) : null}
                    {recovery && (
                      <>
                        <Note>
                          Refresh and inspect the shared catalog before
                          retrying. Close and reopen an existing record to edit
                          the latest version.
                        </Note>
                        <Action
                          title="Refresh shared data"
                          disabled={busy}
                          onPress={() => {
                            void refreshAndReload();
                          }}
                        />
                      </>
                    )}
                    <Actions>
                      {pending && <PendingStatus action={pending.action} />}
                      <Action
                        tone="primary"
                        title={`Save ${draft.kind}`}
                        disabled={busy || !!recovery}
                        onPress={() => {
                          void save();
                        }}
                      />
                      <Action title="Cancel" disabled={busy} onPress={close} />
                    </Actions>
                  </>
                )}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
      {deleting && (
        <Modal
          transparent
          visible
          onRequestClose={closeDelete}
          accessibilityLabel={`Delete ${deleting.kind === "titles" ? "title" : "kit"}`}
        >
          <View style={modalStyles.backdrop}>
            <View style={modalStyles.dialog}>
              <ScrollView contentContainerStyle={modalStyles.content}>
                <Label>Delete {deleting.name}?</Label>
                <Note>
                  {deleting.kind === "titles"
                    ? "This removes the title for every user, along with its kits, their club links, circulation history, schedule assignments, ballot marks, finalized rankings and club history."
                    : "This removes the kit for every user. A kit that a shared schedule still uses cannot be deleted until it is removed from that schedule."}
                </Note>
                {deleteError ? (
                  <Text accessibilityRole="alert" style={modalStyles.error}>
                    {deleteError}
                  </Text>
                ) : null}
                <PendingStatus action={pending?.action ?? null} />
                <Actions>
                  <Action
                    tone="danger"
                    title="Confirm deletion"
                    disabled={shared.saving}
                    onPress={() => {
                      void confirmDelete();
                    }}
                  />
                  <Action
                    title="Cancel deletion"
                    disabled={shared.saving}
                    onPress={closeDelete}
                  />
                </Actions>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
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
  preview: { width: 96, height: 144, borderRadius: 4, alignSelf: "flex-start" },
  error: { color: "#a22525", fontWeight: "600" },
});
