import { Suspense } from 'react';
import { TestPanel } from '@/components/TestPanel';

export default function TestPage() {
  return (
    <Suspense fallback={<div className="skeleton h-[420px] w-full" />}>
      <TestPanel />
    </Suspense>
  );
}
