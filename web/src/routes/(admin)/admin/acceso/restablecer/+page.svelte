<script lang="ts">
  // acceso/restablecer/ — a password-recovery link (S39): spend the emailed
  // `token_hash`, prove the authenticator FIRST when the account has one
  // (GoTrue refuses a new password at aal1), then the new password. Retires
  // the recovery half of the legacy #inviteCard and auth.js startRecovery().
  // The legacy `?action=reset-password&token_hash=…&type=recovery` query is
  // accepted as is — the email templates keep it until S64 (D-001).
  import EmailLinkFlow from '#lib/components/admin/auth/EmailLinkFlow.svelte';
</script>

<EmailLinkFlow kind="recovery" />
