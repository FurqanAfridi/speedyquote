import { NavGroup } from '@/types';

export const navGroups: NavGroup[] = [
  {
    label: 'Menu',
    items: [
      {
        title: 'Overview',
        url: '/dashboard/overview',
        icon: 'dashboard',
        isActive: false,
        shortcut: ['o', 'o'],
        items: []
      },
      {
        title: 'Records',
        url: '/dashboard/list-management',
        icon: 'post',
        isActive: false,
        shortcut: ['r', 'r'],
        items: []
      },
      {
        title: 'Lookups',
        url: '/dashboard/pin-diagnostics',
        icon: 'code',
        isActive: false,
        shortcut: ['a', 'a'],
        items: []
      },
      {
        title: 'Settings',
        url: '/dashboard/settings',
        icon: 'settings',
        isActive: false,
        shortcut: ['s', 's'],
        items: []
      }
    ]
  }
];
