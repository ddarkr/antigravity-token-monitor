import { writable } from 'svelte/store';
import type { DashboardState } from '../../types';

export const dashboardState = writable<DashboardState | null>(null);
