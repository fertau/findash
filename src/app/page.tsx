import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAdminAuth } from '@/lib/firebase/admin';
import { getUserHouseholds } from '@/lib/db/households';

export default async function Home() {
  const cookieStore = await cookies();
  const session = cookieStore.get('__session')?.value;

  if (!session) {
    redirect('/login');
  }

  try {
    const decoded = await getAdminAuth().verifySessionCookie(session, true);
    const householdIds = await getUserHouseholds(decoded.uid);

    if (householdIds.length > 0) {
      redirect(`/h/${householdIds[0]}/dashboard`);
    }

    // No households — the login page handles household creation
    redirect('/login');
  } catch {
    redirect('/login');
  }
}
