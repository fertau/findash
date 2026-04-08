import { getServerUser } from '@/lib/auth/server-session';
import { getHousehold } from '@/lib/db/households';
import { notFound } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

interface Props {
  children: React.ReactNode;
  params: Promise<{ householdId: string }>;
}

export default async function HouseholdLayout({ children, params }: Props) {
  const { householdId } = await params;
  const user = await getServerUser();

  const household = await getHousehold(householdId);
  if (!household) {
    notFound();
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        householdId={householdId}
        householdName={household.name}
        userName={user.displayName}
      />
      <main className="flex-1 p-6 pb-20 md:pb-6 overflow-auto">
        {children}
      </main>
    </div>
  );
}
