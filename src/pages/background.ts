import { browser, WebRequest } from 'webextension-scripts/polyfill';
import { fetchProlificStudies } from '../functions/fetchProlificStudies';
import { openProlificStudy } from '../functions/openProlificStudy';
import { configureStore } from '../store';
import { prolificStudiesUpdate, prolificErrorUpdate } from '../store/prolific/actions';
import { sessionLastChecked } from '../store/session/action';
import { prolificStudiesUpdateMiddleware } from '../store/prolificStudiesUpdateMiddleware';
import { settingsAlertSoundMiddleware } from '../store/settingsAlertSoundMiddleware';

const store = configureStore(prolificStudiesUpdateMiddleware, settingsAlertSoundMiddleware);

const RETRY_INTERVAL_MIN = 1000; // 1 second
const RETRY_INTERVAL_MAX = 5000; // 5 seconds

let authHeader: WebRequest.HttpHeadersItemType;
let timeout = window.setTimeout(main);
let studiesToRetry: string[] = [];

// Load studies to retry from storage
browser.storage.sync.get(['studiesToRetry'], (result) => {
  if (result.studiesToRetry) {
    studiesToRetry = result.studiesToRetry;
  }
});

function updateResults(results: any[]) {
  store.dispatch(prolificStudiesUpdate(results));
  store.dispatch(sessionLastChecked());
  browser.browserAction.setBadgeText({ text: results.length ? results.length.toString() : '' });
}

async function main() {
  clearTimeout(timeout);
  const state = store.getState();

  if (authHeader) {
    try {
      const response = await fetchProlificStudies(authHeader);

      if (response.results) {
        updateResults(response.results);
        browser.browserAction.setBadgeBackgroundColor({ color: 'red' });
        processStudies(response.results);
      }

      if (response.error) {
        handleError(response.error.status);
      }
    } catch (error) {
      handleError();
      window.console.error('fetchProlificStudies error', error);
    }
  } else {
    handleError(401);
  }

  timeout = window.setTimeout(main, getRandomInterval(state.settings.check_interval * 1000));
}

function processStudies(studies: any[]) {
  for (const study of studies) {
    if (studiesToRetry.includes(study.id)) {
      retryStudy(study.id);
    }
  }
}

function retryStudy(studyId: string) {
  const interval = getRandomInterval();
  setTimeout(async () => {
    if (!authHeader) return;

    const headers = { Authorization: authHeader };
    try {
      const response = await fetch(`https://www.prolific.co/api/v1/studies/${studyId}/retry`, { method: 'POST', headers });
      const data = await response.json();
      console.log('Retry response:', data);
    } catch (error) {
      console.error('Error retrying study:', error);
    }
  }, interval);
}

function getRandomInterval(baseInterval: number = 1000) {
  return baseInterval + Math.floor(Math.random() * (RETRY_INTERVAL_MAX - RETRY_INTERVAL_MIN + 1)) + RETRY_INTERVAL_MIN;
}

function handleError(status?: number) {
  if (status === 401) {
    store.dispatch(prolificErrorUpdate(401));
    browser.browserAction.setBadgeText({ text: '!' });
    browser.browserAction.setBadgeBackgroundColor({ color: 'red' });
  } else {
    store.dispatch(prolificStudiesUpdate([]));
    browser.browserAction.setBadgeText({ text: 'ERR' });
    browser.browserAction.setBadgeBackgroundColor({ color: 'black' });
  }
}

browser.notifications.onClicked.addListener((notificationId) => {
  browser.notifications.clear(notificationId);
  openProlificStudy(notificationId);
});

function handleSignedOut() {
  authHeader = null;
  updateResults([]);
  store.dispatch(prolificErrorUpdate(401));
}

browser.webNavigation.onCompleted.addListener(handleSignedOut, {
  url: [{ urlEquals: 'https://www.prolific.co/auth/accounts/login/' }],
});

browser.webNavigation.onHistoryStateUpdated.addListener(handleSignedOut, {
  url: [{ urlEquals: 'https://app.prolific.co/login' }],
});

browser.webRequest.onBeforeSendHeaders.addListener((details) => {
  const foundAuthHeader = details.requestHeaders.find((header) => header.name === 'Authorization');
  
  if (foundAuthHeader && foundAuthHeader.value !== 'Bearer null') {
    const restart = !authHeader;
    authHeader = foundAuthHeader;
    if (restart) main();
  }
  return {};
}, { urls: ['https://www.prolific.co/api/*'] }, ['blocking', 'requestHeaders']);

browser.runtime.onMessage.addListener((message) => {
  if (message === 'check_for_studies') {
    main();
  }
});
