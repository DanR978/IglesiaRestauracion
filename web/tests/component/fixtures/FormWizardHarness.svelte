<!--
  Test fixture (S21). Owns the bind:open read-back and records what onSubmit /
  onDone received, so the tests can assert the payload the wizard hands to a
  spec's toPayload().
-->
<script lang="ts">
  import FormWizard from '$lib/components/FormWizard.svelte';
  import type { WizardData, WizardStep, WizardSubmitResult } from '$lib/components/wizard';

  interface Props {
    open?: boolean;
    title?: string;
    icon?: string;
    submitLabel?: string;
    steps: WizardStep[];
    data?: WizardData;
    onSubmit?: (data: WizardData) => WizardSubmitResult | Promise<WizardSubmitResult>;
    onDone?: (data: WizardData) => void;
    onClose?: () => void;
  }

  let {
    open = $bindable(true),
    title = 'Nuevo ingreso',
    icon = 'arrow-down',
    submitLabel = 'Guardar ingreso',
    steps,
    data = {},
    onSubmit = () => undefined,
    onDone,
    onClose,
  }: Props = $props();
</script>

<button type="button" data-testid="opener">Abrir</button>

<FormWizard bind:open {title} {icon} {submitLabel} {steps} {data} {onSubmit} {onDone} {onClose} />

<p data-testid="open-state">{open ? 'abierto' : 'cerrado'}</p>
