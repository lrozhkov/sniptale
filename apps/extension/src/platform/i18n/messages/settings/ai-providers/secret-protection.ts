import { defineMessageSource } from '../../source';

export const settingsAiProvidersSecretProtectionMessages = defineMessageSource({
  secretProtectionTitle: {
    ru: 'Защита ключей AI',
    en: 'AI key protection',
  },
  secretProtectionTransparentDescription: {
    ru: 'Прозрачный режим не хранит ключи открытым текстом, но материал расшифровки остаётся в этом профиле браузера. Дамп профиля может восстановить ключи провайдеров.',
    en: 'Transparent mode avoids plaintext key storage, but decryption material remains in this browser profile. A profile dump can recover provider keys.',
  },
  secretProtectionPassphraseDescription: {
    ru: 'В режиме фразы ключи провайдеров шифруются фразой, которая не сохраняется; дамп storage не расшифрует их без фразы, а после перезапуска фонового процесса нужна разблокировка.',
    en: 'Passphrase mode encrypts provider keys with a passphrase that is not stored; a storage dump cannot decrypt them without it, and unlock is required after a background restart.',
  },
  secretProtectionOffStatus: {
    ru: 'Прозрачный режим: локальная обфускация, восстанавливаемо из storage профиля; это не защита данных на диске.',
    en: 'Transparent mode: local obfuscation, recoverable from profile storage; not at-rest protection.',
  },
  secretProtectionUnlockedStatus: {
    ru: 'Включено, текущая сессия разблокирована.',
    en: 'On, current session is unlocked.',
  },
  secretProtectionLockedStatus: {
    ru: 'Включено, текущая сессия заблокирована.',
    en: 'On, current session is locked.',
  },
  secretProtectionModeLabel: {
    ru: 'Режим',
    en: 'Mode',
  },
  secretProtectionTransparentMode: {
    ru: 'Прозрачный',
    en: 'Transparent',
  },
  secretProtectionPassphraseMode: {
    ru: 'Фраза',
    en: 'Passphrase',
  },
  secretProtectionSessionLabel: {
    ru: 'Сессия',
    en: 'Session',
  },
  secretProtectionSessionLocked: {
    ru: 'Заблокирована',
    en: 'Locked',
  },
  secretProtectionSessionUnlocked: {
    ru: 'Разблокирована',
    en: 'Unlocked',
  },
  secretProtectionEnableAction: {
    ru: 'Включить',
    en: 'Enable',
  },
  secretProtectionUnlockAction: {
    ru: 'Разблокировать',
    en: 'Unlock',
  },
  secretProtectionLockAction: {
    ru: 'Заблокировать',
    en: 'Lock',
  },
  secretProtectionDisableAction: {
    ru: 'Отключить',
    en: 'Disable',
  },
  secretProtectionChangeAction: {
    ru: 'Сменить фразу',
    en: 'Change passphrase',
  },
  secretProtectionResetAction: {
    ru: 'Сбросить',
    en: 'Reset',
  },
  secretProtectionEnableTitle: {
    ru: 'Включить защиту ключей',
    en: 'Enable key protection',
  },
  secretProtectionUnlockTitle: {
    ru: 'Разблокировать ключи AI',
    en: 'Unlock AI keys',
  },
  secretProtectionDisableTitle: {
    ru: 'Отключить защиту ключей',
    en: 'Disable key protection',
  },
  secretProtectionChangeTitle: {
    ru: 'Сменить фразу защиты',
    en: 'Change protection passphrase',
  },
  secretProtectionResetTitle: {
    ru: 'Сбросить защиту ключей',
    en: 'Reset key protection',
  },
  secretProtectionResetDescription: {
    ru: 'Сброс удалит сохранённые API-ключи провайдеров. Забытые фразы восстановить нельзя.',
    en: 'Reset removes stored provider API keys. Forgotten passphrases cannot be recovered.',
  },
  secretProtectionPassphraseLabel: {
    ru: 'Фраза',
    en: 'Passphrase',
  },
  secretProtectionCurrentPassphraseLabel: {
    ru: 'Текущая фраза',
    en: 'Current passphrase',
  },
  secretProtectionNewPassphraseLabel: {
    ru: 'Новая фраза',
    en: 'New passphrase',
  },
  secretProtectionConfirmPassphraseLabel: {
    ru: 'Повтор фразы',
    en: 'Confirm passphrase',
  },
  secretProtectionPassphraseRequired: {
    ru: 'Введите фразу.',
    en: 'Enter the passphrase.',
  },
  secretProtectionPassphraseMismatch: {
    ru: 'Фразы не совпадают.',
    en: 'Passphrases do not match.',
  },
  secretProtectionActionError: {
    ru: 'Не удалось изменить защиту ключей AI.',
    en: 'Unable to update AI key protection.',
  },
  secretProtectionUnlockCancelled: {
    ru: 'Разблокировка ключей AI отменена.',
    en: 'AI key unlock was cancelled.',
  },
  secretProtectionEnabled: {
    ru: 'Защита ключей AI включена',
    en: 'AI key protection enabled',
  },
  secretProtectionUnlocked: {
    ru: 'Ключи AI разблокированы',
    en: 'AI keys unlocked',
  },
  secretProtectionLocked: {
    ru: 'Ключи AI заблокированы',
    en: 'AI keys locked',
  },
  secretProtectionDisabled: {
    ru: 'Защита ключей AI отключена',
    en: 'AI key protection disabled',
  },
  secretProtectionChanged: {
    ru: 'Фраза защиты обновлена',
    en: 'Protection passphrase changed',
  },
  secretProtectionReset: {
    ru: 'Защита сброшена, ключи провайдеров удалены',
    en: 'Protection reset, provider keys removed',
  },
});
