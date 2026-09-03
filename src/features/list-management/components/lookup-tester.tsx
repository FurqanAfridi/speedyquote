import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { testPinLookupFn } from '@/features/list-management/api/server';

export function LookupTester({ initialPin = '' }: { initialPin?: string }) {
  const [testPin, setTestPin] = React.useState(initialPin);
  const [testZip, setTestZip] = React.useState('');
  const [testAni, setTestAni] = React.useState('');
  const [testResult, setTestResult] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (initialPin) setTestPin(initialPin);
  }, [initialPin]);

  const testMutation = useMutation({
    mutationFn: (input: { pin?: string; zip?: string; caller_id?: string }) =>
      testPinLookupFn({ data: input }),
    onSuccess: (body) => {
      setTestResult(JSON.stringify(body, null, 2));
      toast.success(body.match_method === 'unmatched' ? 'No match' : `Hit (${body.match_method})`);
    },
    onError: (err: Error) => toast.error(err.message)
  });

  return (
    <div className='space-y-3'>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
        <div className='space-y-2'>
          <Label htmlFor='test-pin'>PIN</Label>
          <Input id='test-pin' value={testPin} onChange={(e) => setTestPin(e.target.value)} />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='test-zip'>ZIP</Label>
          <Input id='test-zip' value={testZip} onChange={(e) => setTestZip(e.target.value)} />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='test-ani'>Caller ID</Label>
          <Input id='test-ani' value={testAni} onChange={(e) => setTestAni(e.target.value)} />
        </div>
      </div>
      <Button
        type='button'
        variant='secondary'
        disabled={testMutation.isPending || (!testPin && !testZip && !testAni)}
        onClick={() =>
          testMutation.mutate({
            pin: testPin || undefined,
            zip: testZip || undefined,
            caller_id: testAni || undefined
          })
        }
      >
        {testMutation.isPending ? 'Looking up…' : 'Test lookup'}
      </Button>
      {testResult && (
        <pre className='bg-muted max-h-72 overflow-auto rounded-md p-3 text-xs'>{testResult}</pre>
      )}
    </div>
  );
}
