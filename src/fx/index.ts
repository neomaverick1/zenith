// The two effect layers, shared by every screen. Created once by the app when it starts.
import type { Nebula } from './nebula';
import type { Sparks } from './particles';

export const fx: { nebula: Nebula | null; sparks: Sparks | null } = { nebula: null, sparks: null };
