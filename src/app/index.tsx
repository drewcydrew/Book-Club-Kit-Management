import { Link } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
import { Card, Label, Note, Page } from '../components/ui';
import { useStore } from '../state/store';

export default function Home() {
  const { data } = useStore();
  return <Page title="Welcome">
    <Card><Label>Explore a fictional library</Label>
      <Note>Clubs, titles and kit links are shared and publicly writable; use fictional data only. Members, voting, schedules and circulation remain local to this device and are not encrypted.</Note>
      <Text>{data.titles.length} titles · {data.kits.length} kits · {data.clubs.length} clubs · {data.cycles.length} cycles</Text>
    </Card>
    <Card><Label>Start here</Label>
      <Link href="/preferences">Vote and review preferences →</Link>
      <Link href="/schedule">Create and review a schedule →</Link>
      <Link href="/circulation">Record kit circulation →</Link>
    </Card>
  </Page>;
}
