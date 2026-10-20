<script lang="ts">
  // acceso/invitacion/ — accept an invitation (S39): spend the emailed
  // `token_hash`, then a first password (or Google / Microsoft), then the
  // authenticator. Retires the invite half of the legacy #inviteCard. The
  // legacy `?action=accept-invite&token_hash=…&type=…` query is accepted as
  // is — the email templates keep it until S64 (D-001).
  import EmailLinkFlow from '#lib/components/admin/auth/EmailLinkFlow.svelte';
</script>

<EmailLinkFlow kind="invite" />
