import { defineMessageSource } from '../source';

export const settingsSecretProtectionMessages = defineMessageSource({
  title: {
    ru: 'Защита секретов',
    en: 'Secret protection',
  },
  transparentDescription: {
    ru: 'Локальное шифрование не хранит секреты открытым текстом, но ключ расшифровки остаётся в этом профиле браузера. Копия профиля позволяет восстановить секреты.',
    en: 'Local encryption does not store credentials as plain text. Its decryption key stays in this browser profile. A copy of the profile can recover credentials.',
  },
  passphraseDescription: {
    ru: 'Секреты подключённых участников шифруются общей фразой, которая не сохраняется. Без фразы копия профиля не расшифрует их. После перезапуска фонового процесса нужна разблокировка.',
    en: 'Enrolled credentials use a shared passphrase that is not stored. A profile copy cannot decrypt them without it. Unlock is required after the background process restarts.',
  },
  offStatus: {
    ru: 'Локальное шифрование: ключ расшифровки остаётся в этом профиле браузера.',
    en: 'Local encryption. Decryption material stays in this browser profile.',
  },
  unlockedStatus: {
    ru: 'Включено, текущая сессия разблокирована.',
    en: 'On, current session is unlocked.',
  },
  lockedStatus: {
    ru: 'Включено, текущая сессия заблокирована.',
    en: 'On, current session is locked.',
  },
  modeLabel: {
    ru: 'Режим',
    en: 'Mode',
  },
  transparentMode: {
    ru: 'Локальное шифрование',
    en: 'Local encryption',
  },
  passphraseMode: {
    ru: 'Общая фраза',
    en: 'Shared passphrase',
  },
  sessionLabel: {
    ru: 'Сессия',
    en: 'Session',
  },
  sessionLocked: {
    ru: 'Заблокирована',
    en: 'Locked',
  },
  sessionUnlocked: {
    ru: 'Разблокирована',
    en: 'Unlocked',
  },
  enableAction: {
    ru: 'Включить',
    en: 'Enable',
  },
  unlockAction: {
    ru: 'Разблокировать',
    en: 'Unlock',
  },
  lockAction: {
    ru: 'Заблокировать',
    en: 'Lock',
  },
  disableAction: {
    ru: 'Отключить',
    en: 'Disable',
  },
  changeAction: {
    ru: 'Сменить фразу',
    en: 'Change passphrase',
  },
  resetAction: {
    ru: 'Сбросить',
    en: 'Reset',
  },
  enableTitle: {
    ru: 'Включить защиту фразой',
    en: 'Enable passphrase protection',
  },
  unlockTitle: {
    ru: 'Разблокировать секреты',
    en: 'Unlock secrets',
  },
  disableTitle: {
    ru: 'Отключить защиту фразой',
    en: 'Disable passphrase protection',
  },
  changeTitle: {
    ru: 'Сменить фразу защиты',
    en: 'Change protection passphrase',
  },
  resetTitle: {
    ru: 'Сбросить общую защиту секретов',
    en: 'Reset shared secret protection',
  },
  resetDescription: {
    ru: 'Сброс удалит все защищённые общей фразой API-ключи провайдеров AI и учётные данные WebDAV. Для подключения WebDAV потребуется снова ввести пароль. Проекты, удалённые файлы и секреты вне этой защиты сохранятся. Забытую фразу восстановить нельзя.',
    en: 'Reset deletes all enrolled AI provider API keys and the WebDAV credential. Enter the WebDAV password again to reconnect. Projects, remote files and credentials outside this protection remain. A forgotten passphrase cannot be recovered.',
  },
  passphraseLabel: {
    ru: 'Фраза',
    en: 'Passphrase',
  },
  currentPassphraseLabel: {
    ru: 'Текущая фраза',
    en: 'Current passphrase',
  },
  newPassphraseLabel: {
    ru: 'Новая фраза',
    en: 'New passphrase',
  },
  confirmPassphraseLabel: {
    ru: 'Повтор фразы',
    en: 'Confirm passphrase',
  },
  passphraseRequired: {
    ru: 'Введите фразу.',
    en: 'Enter the passphrase.',
  },
  passphraseMismatch: {
    ru: 'Фразы не совпадают.',
    en: 'Passphrases do not match.',
  },
  actionError: {
    ru: 'Не удалось изменить защиту секретов.',
    en: 'Unable to update secret protection.',
  },
  unlockCancelled: {
    ru: 'Разблокировка секретов отменена.',
    en: 'Secret unlock was cancelled.',
  },
  enabled: {
    ru: 'Защита фразой включена',
    en: 'Passphrase protection enabled',
  },
  unlocked: {
    ru: 'Секреты разблокированы',
    en: 'Secrets unlocked',
  },
  locked: {
    ru: 'Секреты заблокированы',
    en: 'Secrets locked',
  },
  disabled: {
    ru: 'Защита фразой отключена',
    en: 'Passphrase protection disabled',
  },
  changed: {
    ru: 'Фраза защиты обновлена',
    en: 'Protection passphrase changed',
  },
  reset: {
    ru: 'Общая защита сброшена, защищённые секреты удалены',
    en: 'Shared protection reset, enrolled credentials deleted',
  },
  aiParticipant: {
    ru: 'API-ключи провайдеров AI',
    en: 'AI provider API keys',
  },
  webdavParticipant: {
    ru: 'Учётные данные WebDAV',
    en: 'WebDAV credential',
  },
  aiParticipantDescription: {
    ru: 'Защищать API-ключи провайдеров AI общей фразой.',
    en: 'Protect AI provider API keys with the shared passphrase.',
  },
  webdavParticipantDescription: {
    ru: 'Защищать учётные данные WebDAV общей фразой.',
    en: 'Protect the WebDAV credential with the shared passphrase.',
  },
  participantEnabled: {
    ru: 'Защита фразой включена',
    en: 'Passphrase protection is on',
  },
  participantDisabled: {
    ru: 'Локальное шифрование',
    en: 'Local encryption',
  },
  unknownStatus: {
    ru: 'Статус защиты недоступен. Повторите запрос перед изменением защиты.',
    en: 'Protection status is unavailable. Retry before you change protection.',
  },
  loadingStatus: {
    ru: 'Загрузка статуса защиты…',
    en: 'Loading protection status…',
  },
  retryAction: {
    ru: 'Повторить',
    en: 'Retry',
  },
  openSettingsAction: {
    ru: 'Управление общей защитой',
    en: 'Manage shared protection',
  },
  joinDescription: {
    ru: 'У этого профиля уже есть фраза. Используйте её для защиты выбранных секретов.',
    en: 'This profile already has a passphrase. Reuse it to protect the selected credentials.',
  },
});
