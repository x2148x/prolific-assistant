document.getElementById('addStudy').addEventListener('click', () => {
  const studyId = document.getElementById('studyId').value;
  if (studyId) {
    chrome.storage.sync.get(['studiesToRetry'], (result) => {
      let studies = result.studiesToRetry || [];
      if (!studies.includes(studyId)) {
        studies.push(studyId);
        chrome.storage.sync.set({ studiesToRetry: studies }, () => {
          updateStudyList(studies);
        });
      }
    });
  }
});

function updateStudyList(studies) {
  const studyList = document.getElementById('studyList');
  studyList.innerHTML = '';
  studies.forEach(study => {
    const li = document.createElement('li');
    li.textContent = study;
    studyList.appendChild(li);
  });
}

chrome.storage.sync.get(['studiesToRetry'], (result) => {
  if (result.studiesToRetry) {
    updateStudyList(result.studiesToRetry);
  }
});
