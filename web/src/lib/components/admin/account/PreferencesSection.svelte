<!--
  PreferencesSection — Mi cuenta › Preferencias (S45, D-038). One choice: the
  admin's theme — Claro / Oscuro / Sistema — bound to adminTheme.current
  (#lib/theme.svelte), which is stored per device under the admin's own key
  (`ird.app.admin.theme`) and painted at once; the public site keeps its own.
  It applies as it is chosen, so there is nothing to save.

  Retires the dead legacy prefs plumbing (js/pages/admin/prefs.js setPref /
  landingOptions / applyLandingPref, the `adm-density-compact` /
  `adm-reduce-motion` CSS): density, reduce-motion and landing-tab are NOT
  ported — reduced motion follows the system setting everywhere, and the
  admin opens on Inicio (PORT-DEBT S45).

  Usage:
    <PreferencesSection />
-->
<script lang="ts">
  import SegmentedControl from '#lib/components/SegmentedControl.svelte';
  import type { SegmentedOption } from '#lib/components/segmented-control.js';
  import { adminTheme, isTheme } from '#lib/theme.svelte.js';
  import AccountPanel from './AccountPanel.svelte';
  import AccountSection from './AccountSection.svelte';

  const THEME_OPTIONS: SegmentedOption[] = [
    { value: 'light', label: 'Claro', icon: 'sun' },
    { value: 'dark', label: 'Oscuro', icon: 'moon' },
    { value: 'system', label: 'Sistema', icon: 'circle-half-stroke' },
  ];
</script>

<AccountSection title="Preferencias" lede="Cómo se ve el panel en este dispositivo.">
  <AccountPanel
    title="Tema"
    description="Se guarda en este dispositivo. El sitio público conserva su propia elección."
  >
    <!-- The panel's heading names the control; the label stays for screen readers. -->
    <SegmentedControl
      label="Tema del panel"
      hideLabel
      options={THEME_OPTIONS}
      bind:value={
        () => adminTheme.current,
        (next) => {
          if (isTheme(next)) adminTheme.current = next;
        }
      }
    />
  </AccountPanel>
</AccountSection>
