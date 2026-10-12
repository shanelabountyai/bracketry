import Link from 'next/link';
import { inOrg, requireOrg } from '@/core/authz/guards';
import { can } from '@/core/authz/permissions';
import { db } from '@/core/db';
import { ActionForm } from '@/core/ui/action-form';
import { addSeason } from './actions';

export const metadata = { title: 'Seasons' };

export default async function Seasons({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrg((await params).org);
  const seasons = await db.season.findMany({ where: inOrg(ctx), orderBy: { firstDay: 'desc' } });
  return (
    <main>
      <h1>Seasons</h1>
      <ul>
        {seasons.map((s) => (
          <li key={s.id}>
            <Link href={`/o/${ctx.slug}/seasons/${s.id}`}>{s.name}</Link> · {s.firstDay} to {s.lastDay} · {s.status}
          </li>
        ))}
      </ul>
      {can(ctx.role, 'org.update') && (
        <>
          <h2>New season</h2>
          <ActionForm action={addSeason.bind(null, ctx.slug)}>
            <label>Name <input name="name" required maxLength={120} /></label>
            <label>Timezone <input name="timezone" defaultValue="America/Chicago" required /></label>
            <label>First day <input name="firstDay" type="date" required /></label>
            <label>Last day <input name="lastDay" type="date" required /></label>
            <label>Game length (minutes) <input name="gameMinutes" type="number" defaultValue={90} min={15} max={480} required /></label>
            <button type="submit">Create season</button>
          </ActionForm>
        </>
      )}
    </main>
  );
}
