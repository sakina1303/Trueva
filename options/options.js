const els = {
  optIn: document.getElementById('optIn'),
  apiKey: document.getElementById('apiKey'),
  apiBase: document.getElementById('apiBase'),
  save: document.getElementById('save'),
  status: document.getElementById('status')
};

async function load() {
  const { settings = {} } = await chrome.storage.local.get('settings');
  els.optIn.checked = !!settings.snopesOptIn;
  els.apiKey.value = settings.snopesApiKey || '';
  els.apiBase.value = settings.snopesApiBase || 'https://api.snopes.com/fact-check';
}

async function save() {
  const settings = {
    ...((await chrome.storage.local.get('settings')).settings || {}),
    snopesOptIn: !!els.optIn.checked,
    snopesApiKey: els.apiKey.value.trim(),
    snopesApiBase: els.apiBase.value.trim() || 'https://api.snopes.com/fact-check'
  };
  await chrome.storage.local.set({ settings });
  els.status.textContent = 'Saved!';
  setTimeout(() => els.status.textContent = '', 1500);
}

els.save.addEventListener('click', save);
load();
