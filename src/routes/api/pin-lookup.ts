import { createFileRoute } from '@tanstack/react-router';
import {
  hasLookupAuthConfigured,
  lookupAttributes,
  verifyBearerToken
} from '@/features/pin-lookup/lookup';

export const Route = createFileRoute('/api/pin-lookup')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await hasLookupAuthConfigured())) {
          return Response.json(
            { error: 'Create an API key in Settings, or set RINGBA_LOOKUP_TOKEN' },
            { status: 503 }
          );
        }
        if (!(await verifyBearerToken(request.headers.get('authorization')))) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let payload: Record<string, unknown> = {};
        try {
          const text = await request.text();
          if (text) {
            try {
              payload = JSON.parse(text) as Record<string, unknown>;
            } catch {
              payload = Object.fromEntries(new URLSearchParams(text));
            }
          }
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 });
        }

        const pin = payload.pin ?? payload.PIN ?? payload.pin_code ?? payload.pinCode;
        const zip = payload.zip ?? payload.ZIP ?? payload.postal_code;
        const callerId =
          payload.caller_id ??
          payload.callerId ??
          payload.ani ??
          payload.ANI ??
          payload.phone;
        const callId = (payload.call_id as string | undefined) ?? (payload.callId as string | undefined) ?? null;

        const { body, latencyMs } = await lookupAttributes({
          pin,
          zip,
          caller_id: callerId,
          call_id: callId
        });

        return Response.json(body, {
          status: 200,
          headers: {
            'Cache-Control': 'no-store',
            'X-Lookup-Latency-Ms': String(latencyMs)
          }
        });
      }
    }
  }
});
