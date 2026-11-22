import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { addDays, today, validDate } from '../domain/dates';
import { lastDayOfMonth, shiftMonth } from '../domain/cycle-overview';
import { id } from '../domain/logic';
import { ApiError, type LibrarySetup } from '../state/api';
import { useLibraryService } from '../state/library-service';
import { useSharedStatus } from '../state/shared';
import { useDraftNavigationGuard } from './navigation-guard';
import { DateField } from './date-field';
import { MonthField } from './month-field';
import { Action, Actions, Card, Field, Label, Note, styles } from './ui';

const suggestions = [
  { name: 'A family of strangers', author: 'Fiona Lowe', isbn: '9781867255970' },
  { name: 'A pocketful of happiness', author: 'Richard E. Grant', isbn: '9781398519503' },
  { name: "A woman's voice", author: 'Alli Sinclair', isbn: '9781761344947' },
  { name: 'All our shimmering skies', author: 'Trent Dalton', isbn: '9781460753903' },
  { name: 'All the words we know', author: 'Bruce Nash', isbn: '9781668053607' },
  { name: 'Always home, always homesick', author: 'Hannah Kent', isbn: '9781761903212' },
  { name: 'An afterlife for Rosemary Lamb', author: 'Louise Wolhuter', isbn: '9781761151712' },
  { name: 'An ill wind', author: 'Margaret Hickey', isbn: '9781761342066' },
  { name: 'Anna O', author: 'Matthew Blake', isbn: '9780063314153' },
  { name: 'Apples never fall', author: 'Liane Moriarty', isbn: '9781760985707' },
  { name: 'Atmosphere', author: 'Taylor Jenkins Reid', isbn: '9781804941430' },
  { name: 'Baggage: tales from a fully packed life', author: 'Alan Cumming', isbn: '9780062435781' },
];

type ChosenTitle = { key: string; name: string; author: string; isbn: string; copies: string };

export function LibraryServiceSetup() {
  const library = useLibraryService();
  const { pendingSetup } = library;
  const { saving } = useSharedStatus();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [pendingChecked, setPendingChecked] = useState(false);
  const [checkAttempt, setCheckAttempt] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [message, setMessage] = useState('');
  const [requestId, setRequestId] = useState(id);
  const [name, setName] = useState('');
  const [branches, setBranches] = useState('');
  const [cycleName, setCycleName] = useState('');
  const [deadline, setDeadline] = useState(addDays(today(), 30));
  const [startMonth, setStartMonth] = useState(shiftMonth(today().slice(0, 7), 1));
  const [endMonth, setEndMonth] = useState(shiftMonth(today().slice(0, 7), 12));
  const [titles, setTitles] = useState<ChosenTitle[]>([]);
  const [manualName, setManualName] = useState('');
  const [manualAuthor, setManualAuthor] = useState('');
  const [manualIsbn, setManualIsbn] = useState('');
  const [clubName, setClubName] = useState('');
  const [clubSize, setClubSize] = useState('10');
  const [memberName, setMemberName] = useState('');
  const navigationConfirmation = useDraftNavigationGuard(open, busy);
  const branchList = branches.split(',').map((branch) => branch.trim()).filter(Boolean);

  useEffect(() => {
    let active = true;
    void pendingSetup().then((value) => {
      if (active) { setPending(value); setPendingChecked(true); setMessage(''); }
    })
      .catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : 'Unable to check previous setup.'); });
    return () => { active = false; };
  }, [pendingSetup, checkAttempt]);

  function reset() {
    setOpen(false); setStep(0); setUncertain(false); setConfirmCancel(false); setMessage('');
    setRequestId(id()); setName(''); setBranches(''); setCycleName(''); setTitles([]);
    setManualName(''); setManualAuthor(''); setManualIsbn(''); setClubName(''); setMemberName(''); setClubSize('10');
    setDeadline(addDays(today(), 30)); setStartMonth(shiftMonth(today().slice(0, 7), 1)); setEndMonth(shiftMonth(today().slice(0, 7), 12));
  }

  function validateStep(current: number): string {
    if (current === 0 && (!name.trim() || !branchList.length || new Set(branchList).size !== branchList.length)) return 'Enter a service name and at least one unique branch.';
    if (current === 1 && (!cycleName.trim() || !validDate(deadline) || deadline <= today() ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(endMonth) || endMonth < startMonth ||
      deadline >= lastDayOfMonth(endMonth))) {
      return 'Enter a cycle name, a future deadline and valid months ending after the deadline.';
    }
    if (current === 2 && (!titles.length || titles.some((title) => !Number.isSafeInteger(Number(title.copies)) || Number(title.copies) < 1 || Number(title.copies) > 10000))) {
      return 'Add at least one title and enter a valid copy count for every kit.';
    }
    if (current === 3 && clubName.trim() && (!Number.isSafeInteger(Number(clubSize)) || Number(clubSize) < 1)) return 'Enter a valid club size.';
    return '';
  }

  function next() {
    const error = validateStep(step);
    if (error) { setMessage(error); return; }
    setMessage(''); setStep((value) => value + 1);
  }

  function toggleSuggestion(book: typeof suggestions[number]) {
    setTitles((current) => current.some((title) => title.key === book.isbn)
      ? current.filter((title) => title.key !== book.isbn)
      : [...current, { ...book, key: book.isbn, copies: '10' }]);
  }

  function submit() {
    for (let index = 0; index < 4; index++) {
      const error = validateStep(index);
      if (error) { setStep(index); setMessage(error); return; }
    }
    const setup: LibrarySetup = {
      requestId, name: name.trim(), branches: branchList,
      cycle: { name: cycleName.trim(), deadline, startsOn: `${startMonth}-01`, endsOn: lastDayOfMonth(endMonth) },
      titles: titles.map(({ name: titleName, author, isbn, copies }) => ({ name: titleName, author, isbn, copies: Number(copies) })),
      club: clubName.trim() ? { name: clubName.trim(), branch: branchList[0], size: Number(clubSize) } : null,
      member: memberName.trim() ? { name: memberName.trim() } : null,
    };
    setBusy(true); setMessage('');
    void library.setup(setup).then(finish).catch((error: unknown) => {
      const failedValidation = error instanceof ApiError && error.status === 400;
      setUncertain(!failedValidation);
      setPending(failedValidation ? null : requestId);
      setMessage(error instanceof Error ? error.message : 'Unable to create the service.');
    }).finally(() => setBusy(false));
  }

  function finish() {
    reset();
    setPendingChecked(false);
    setCheckAttempt((value) => value + 1);
  }

  function recover() {
    if (!pending) return;
    setBusy(true); setMessage('');
    void library.recoverSetup(pending).then(finish).catch((error: unknown) => {
      setMessage(error instanceof ApiError && error.status === 404
        ? 'No completed setup was found. Check again before clearing the pending request.'
        : error instanceof Error ? error.message : 'Unable to check the previous setup.');
    }).finally(() => setBusy(false));
  }

  return <Card><Label>Library services</Label>
    {library.setupNotice && <Note>{library.setupNotice}</Note>}
    {library.error && <Text accessibilityLiveRegion="polite" style={styles.error}>{library.error}</Text>}
    {!pendingChecked ? <Action title="Retry checking previous setup" disabled={!message || busy}
      onPress={() => setCheckAttempt((value) => value + 1)} /> : pending && !open ? <>
      <Note>A previous setup may have completed. Check its result before starting another.</Note>
      <Actions><Action title="Check previous setup" disabled={busy || saving} onPress={recover} />
        <Action title="Clear pending setup" disabled={busy || saving} onPress={() => setConfirmClear(true)} /></Actions>
      {confirmClear && <><Note>Only clear this after checking. If the earlier request later completes, a second setup could create a duplicate.</Note>
        <Actions><Action tone="danger" title="Confirm clear pending setup" onPress={() => {
          void library.discardPendingSetup().then(() => { setPending(null); setConfirmClear(false); })
            .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Unable to clear pending setup.'));
        }} /><Action title="Keep pending setup" onPress={() => setConfirmClear(false)} /></Actions></>}
    </> : <Action title="Create a library service" tone="primary" disabled={saving || busy} onPress={() => setOpen(true)} />}
    {!open && message ? <Text style={styles.error}>{message}</Text> : null}
    {navigationConfirmation}
    <Modal visible={open} transparent onRequestClose={() => { if (!busy) setConfirmCancel(true); }} accessibilityLabel="Create library service">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 16 }}>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: '90%', backgroundColor: '#fffefa', width: '100%', maxWidth: 700, alignSelf: 'center' }}
          contentContainerStyle={{ padding: 20, gap: 12 }}>
          {confirmCancel ? <>
            <Label>Discard this setup?</Label><Note>No service is created until setup is confirmed. An uncertain request remains available to check.</Note>
            <Actions><Action tone="danger" title="Discard setup" onPress={reset} /><Action title="Keep editing" onPress={() => setConfirmCancel(false)} /></Actions>
          </> : <>
            <Label>Create library service · Step {step + 1} of 5</Label>
            {step === 0 && <>
              <Field label="Library service name" value={name} onChangeText={setName} editable={!busy} />
              <Field label="Branches (comma separated)" value={branches} onChangeText={setBranches} editable={!busy} />
            </>}
            {step === 1 && <>
              <Field label="Cycle name" value={cycleName} onChangeText={setCycleName} editable={!busy} />
              <MonthField label="First month" value={startMonth} onChange={setStartMonth} editable={!busy} />
              <MonthField label="Last month" value={endMonth} onChange={setEndMonth} editable={!busy} />
              <DateField label="Preference deadline" value={deadline} onChange={setDeadline} editable={!busy} />
              <Note>Voting opens immediately and remains open through the deadline.</Note>
            </>}
            {step === 2 && <>
              <Label>Choose starter books or add your own</Label>
              <Note>Every chosen title gets a kit at the first branch with 10 copies and a generated placeholder barcode. Update these details in Catalog. You can add more titles and kits later.</Note>
              <Actions>{suggestions.map((book) => <Action key={book.isbn} title={`${book.name} · ${book.author}`}
                selected={titles.some((title) => title.key === book.isbn)} disabled={busy} onPress={() => toggleSuggestion(book)} />)}</Actions>
              <Field label="New title" value={manualName} onChangeText={setManualName} editable={!busy} />
              <Field label="Author" value={manualAuthor} onChangeText={setManualAuthor} editable={!busy} />
              <Field label="ISBN (optional)" value={manualIsbn} onChangeText={setManualIsbn} editable={!busy} />
              <Action title="Add title" disabled={busy || !manualName.trim() || !manualAuthor.trim()} onPress={() => {
                setTitles((current) => [...current, { key: id(), name: manualName.trim(), author: manualAuthor.trim(), isbn: manualIsbn.trim(), copies: '10' }]);
                setManualName(''); setManualAuthor(''); setManualIsbn('');
              }} />
              {titles.map((title) => <View key={title.key} style={{ gap: 5 }}>
                <Field label={`Copies for ${title.name}`} value={title.copies} editable={!busy}
                  onChangeText={(copies) => setTitles((current) => current.map((item) => item.key === title.key ? { ...item, copies } : item))} />
                <Action title={`Remove ${title.name}`} disabled={busy} onPress={() => setTitles((current) => current.filter((item) => item.key !== title.key))} />
              </View>)}
            </>}
            {step === 3 && <>
              <Note>Creating a club and a demo member is optional. If you enter both, the member is enrolled in the club. The club uses the first branch, monthly meetings and pickup; edit these later.</Note>
              <Field label="Club name (optional)" value={clubName} onChangeText={setClubName} editable={!busy} />
              {clubName.trim() ? <Field label="Club size" value={clubSize} onChangeText={setClubSize} editable={!busy} /> : null}
              <Field label="Fictional member name (optional)" value={memberName} onChangeText={setMemberName} editable={!busy} />
              <Note>Demo members are public and impersonable. Use fictional data only.</Note>
            </>}
            {step === 4 && <>
              <Note>{name} · {branchList.join(', ')}</Note>
              <Note>{cycleName}: {startMonth} to {endMonth}, voting through {deadline}.</Note>
              <Note>{titles.length} title{titles.length === 1 ? '' : 's'} and placeholder kit{titles.length === 1 ? '' : 's'}.</Note>
              <Note>{clubName.trim() ? `Club: ${clubName}.` : 'No club yet.'} {memberName.trim() ? `Demo member: ${memberName}.` : 'No member yet.'}</Note>
              <Note>Members choose their library and demo user on Home, then vote on Preferences. This does not create a direct voting link.</Note>
              {uncertain && <Note>The previous request may have succeeded. Retry with the same details or check its result; do not start a new setup yet.</Note>}
            </>}
            {message ? <Text accessibilityLiveRegion="polite" style={styles.error}>{message}</Text> : null}
            <Actions>
              {step > 0 && !uncertain && <Action title="Back" disabled={busy} onPress={() => { setMessage(''); setStep(step - 1); }} />}
              {step < 4 ? <Action title="Next" tone="primary" disabled={busy} onPress={next} />
                : <Action title={busy ? 'Creating...' : 'Create service'} tone="primary" disabled={busy} onPress={submit} />}
              {uncertain && <Action title="Check previous setup" disabled={busy} onPress={recover} />}
              <Action title="Cancel" disabled={busy} onPress={() => setConfirmCancel(true)} />
            </Actions>
          </>}
        </ScrollView>
      </View>
    </Modal>
  </Card>;
}
