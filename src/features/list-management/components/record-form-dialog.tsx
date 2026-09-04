import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PortalSettings, RecordMutationInput, UploadedPiece } from '@/features/list-management/api/types';

function zipDisplay(row: UploadedPiece | null) {
  if (!row) return '';
  if (row.zip && row.zip4) return `${row.zip}-${row.zip4}`;
  return row.zip ?? '';
}

function splitZip(raw: string) {
  const digits = raw.replace(/\D/g, '');
  return { zip: digits.slice(0, 5) || null, zip4: digits.slice(5, 9) || null };
}

export function RecordFormDialog({
  open,
  record,
  settings,
  extraKeys,
  pending,
  onOpenChange,
  onSave
}: {
  open: boolean;
  record: UploadedPiece | null;
  settings: PortalSettings;
  extraKeys: string[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: RecordMutationInput) => void;
}) {
  const isEdit = Boolean(record);
  const [pin, setPin] = React.useState('');
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [address1, setAddress1] = React.useState('');
  const [city, setCity] = React.useState('');
  const [state, setState] = React.useState('');
  const [zip, setZip] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [age, setAge] = React.useState('');
  const [homeowner, setHomeowner] = React.useState('');
  const [vertical, setVertical] = React.useState('');
  const [attrs, setAttrs] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) return;
    setPin(record?.pin_code ?? '');
    setFirstName(record?.first_name ?? '');
    setLastName(record?.last_name ?? '');
    setAddress1(record?.address1 ?? '');
    setCity(record?.city ?? '');
    setState(record?.state ?? '');
    setZip(zipDisplay(record));
    setPhone(record?.known_phone ?? '');
    setAge(record?.age != null ? String(record.age) : '');
    setHomeowner(record?.homeowner_status ?? '');
    setVertical(record?.vertical ?? settings.verticals[0]?.name ?? '');
    const next: Record<string, string> = {};
    for (const key of extraKeys) next[key] = record?.attrs?.[key] ?? '';
    if (record?.attrs) {
      for (const [k, v] of Object.entries(record.attrs)) {
        if (!(k in next)) next[k] = v;
      }
    }
    setAttrs(next);
  }, [open, record, extraKeys, settings.verticals]);

  function submit() {
    const parsedAge = age.trim() ? Number.parseInt(age, 10) : null;
    const { zip: zip5, zip4 } = splitZip(zip);
    const cleanAttrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(attrs)) {
      if (v.trim()) cleanAttrs[k] = v.trim();
    }
    onSave({
      record_id: record?.record_id,
      pin: pin.trim(),
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      address1: address1.trim() || null,
      city: city.trim() || null,
      state: state.trim() || null,
      zip: zip5,
      zip4,
      age: parsedAge != null && Number.isFinite(parsedAge) ? parsedAge : null,
      homeowner_status: homeowner.trim() || null,
      known_phone: phone.trim() || null,
      list_source: record?.list_source ?? settings.default_list_source ?? null,
      vertical: vertical.trim() || null,
      attrs: cleanAttrs
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit record' : 'New record'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update this row and save.' : 'Add a single record without uploading a file.'}
          </DialogDescription>
        </DialogHeader>
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
          <div className='space-y-2 sm:col-span-2'>
            <Label htmlFor='rec-pin'>PIN</Label>
            <Input id='rec-pin' value={pin} onChange={(e) => setPin(e.target.value)} />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='rec-first'>First name</Label>
            <Input id='rec-first' value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='rec-last'>Last name</Label>
            <Input id='rec-last' value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div className='space-y-2 sm:col-span-2'>
            <Label htmlFor='rec-address'>Address</Label>
            <Input id='rec-address' value={address1} onChange={(e) => setAddress1(e.target.value)} />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='rec-city'>City</Label>
            <Input id='rec-city' value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='rec-state'>State</Label>
            <Input id='rec-state' value={state} onChange={(e) => setState(e.target.value)} />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='rec-zip'>ZIP</Label>
            <Input id='rec-zip' value={zip} onChange={(e) => setZip(e.target.value)} />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='rec-phone'>Phone</Label>
            <Input id='rec-phone' value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='rec-age'>Age</Label>
            <Input id='rec-age' value={age} onChange={(e) => setAge(e.target.value)} />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='rec-home'>Homeowner</Label>
            <Input id='rec-home' value={homeowner} onChange={(e) => setHomeowner(e.target.value)} />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='rec-vertical'>Vertical</Label>
            {settings.verticals.length > 0 ? (
              <select
                id='rec-vertical'
                className='border-input bg-background h-9 w-full rounded-md border px-2 text-sm'
                value={vertical}
                onChange={(e) => setVertical(e.target.value)}
              >
                {settings.verticals.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </select>
            ) : (
              <Input id='rec-vertical' value={vertical} onChange={(e) => setVertical(e.target.value)} />
            )}
          </div>
          {Object.keys(attrs).map((key) => (
            <div key={key} className='space-y-2 sm:col-span-2'>
              <Label htmlFor={`rec-attr-${key}`}>{key}</Label>
              <Input
                id={`rec-attr-${key}`}
                value={attrs[key] ?? ''}
                onChange={(e) => setAttrs((cur) => ({ ...cur, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type='button' disabled={pending} onClick={submit}>
            {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create record'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
