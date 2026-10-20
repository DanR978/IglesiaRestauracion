<!--
  ProfileSection — Mi cuenta › Perfil (S45): the photo and display name the
  account edits itself, then the facts an administrator owns. Retires
  account.js renderProfileSection / renderAccountSection / renderHero.

  Usage:
    <ProfileSection {user} {profile} />
-->
<script lang="ts">
  import type { OwnProfile } from '#lib/repos/profiles.js';
  import type { SessionUser } from '#lib/stores/session.svelte.js';
  import AccountFacts from './AccountFacts.svelte';
  import AccountPanel from './AccountPanel.svelte';
  import AccountSection from './AccountSection.svelte';
  import AvatarUploader from './AvatarUploader.svelte';
  import DisplayNameForm from './DisplayNameForm.svelte';

  interface Props {
    user: SessionUser;
    profile: OwnProfile;
  }

  let { user, profile }: Props = $props();

  // The legacy fallback: an account that never set a name shows by its email.
  const shownName = $derived(profile.display_name?.trim() || user.email || '');
</script>

<AccountSection title="Perfil" lede="Tu foto y tu nombre, como te ven los demás en el panel.">
  <AccountPanel title="Foto y nombre">
    <div class="profile-edit">
      <AvatarUploader userId={user.id} name={shownName} photo={profile.avatar_url} />
      <DisplayNameForm name={profile.display_name} />
    </div>
  </AccountPanel>
  <AccountFacts {user} {profile} />
</AccountSection>

<style>
  .profile-edit {
    display: flex;
    flex-direction: column;
    gap: var(--mg-md);
  }
</style>
