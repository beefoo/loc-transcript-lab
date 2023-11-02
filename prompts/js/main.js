class App {
  constructor(options = {}) {
    const defaults = {
      project: 'mary-church-terrell',
    };
    this.options = _.extend({}, defaults, options);
    this.init();
  }

  init() {
    this.defaultState = {
      filters: {
        Project: 'any',
        EstimatedYear: 'any',
      },
      prompt: -1,
    };
    const qparams = StringUtil.queryParams();
    this.setState(qparams);

    this.$main = $('#main-content');
    this.$intro = $('#intro');
    this.$prompt = $('#prompt-text');
    this.$meta = $('#meta');
    this.$documentModal = $('#document-browser');
    this.$statePrev = $('.state-prev');
    this.$stateNext = $('.state-next');

    this.stateHistory = [];
    this.stateIndex = -1;

    this.savedPrompts = StringUtil.loadFromStorage('saved-prompts') || [];

    const promptDataURL = `../data/${this.options.project}/prompts.json`;
    const promptDataPromise = $.getJSON(promptDataURL, (data) => data);

    const transcriptDataURL = `../data/${this.options.project}/prompts-docs.json`;
    const transcriptDataPromise = $.getJSON(transcriptDataURL, (data) => data);
    const imagePromise = $.Deferred();

    // wait to load collage images
    const imagePromises = [];
    $('.collage-image').each((index, imgEl) => {
      const promise = new Promise((resolve, reject) => {
        const src = imgEl.getAttribute('src');
        const img = new Image();
        img.src = src;
        if (img.completed) resolve(imgEl);
        else {
          img.onload = () => {
            resolve(imgEl);
          };
        }
      });
      imagePromises.push(promise);
    });
    Promise.all(imagePromises).then((images) => {
      console.log('Loaded all images');
      this.onImageLoad(images);
      imagePromise.resolve(images);
    });

    this.loadFilters();
    this.renderFilters();
    $.when(promptDataPromise, transcriptDataPromise, imagePromise).done((pdata, tdata, idata) => {
      this.onTranscriptDataLoad(tdata[0].docs);
      this.onPromptDataLoad(pdata[0]);
    });
  }

  downloadSavedPrompts() {
    const { savedPrompts } = this;
    if (savedPrompts.length <= 0) return;
    const rows = _.map(savedPrompts, (p) => {
      const cols = _.pick(p, 'text', 'itemUrl');
      const values = _.values(cols);
      const escaped = values.map((value) => `"${value.replaceAll('"', '\\"')}"`);
      return escaped.join(',');
    });
    rows.unshift('text,url');
    const text = rows.join('\n');
    StringUtil.downloadText('prompts.csv', text, 'csv');
  }

  filterPrompts(resetIndex = true) {
    const { prompts, state } = this;

    const filteredPrompts = prompts.filter((prompt) => {
      let isVisible = true;
      _.each(state.filters, (currentValue, key) => {
        const pvalue = prompt[key];
        if (currentValue !== 'any') {
          if (key === 'EstimatedYear' && currentValue.includes('-')) {
            const [start, end] = currentValue.split('-', 2).map((v) => parseInt(v, 10));
            if (pvalue !== '' && (pvalue < start || pvalue >= end)) isVisible = false;
          } else if (pvalue !== currentValue) isVisible = false;
        }
      });
      return isVisible;
    });

    // hack: if not enough prompts, remove the year filter
    if (filteredPrompts.length <= 3) {
      console.log('Not enough prompts for this filter combination. Removing date filter.');
      const $button = $('#time-period-any');
      this.onFilter($button);
      return;
    }

    // randomize prompts
    this.filteredPrompts = _.shuffle(filteredPrompts);

    // prioritize starred prompts
    const prioritizeStarred = 3;
    let starred = this.filteredPrompts.filter((p) => p.tag === 'starred');
    if (starred.length > prioritizeStarred) starred = starred.slice(0, prioritizeStarred);
    if (starred.length > 0) {
      const starredTexts = _.pluck(starred, 'text');
      const unstarred = this.filteredPrompts.filter((p) => starredTexts.indexOf(p.text) < 0);
      this.filteredPrompts = starred.concat(unstarred);
    }

    if (resetIndex) this.state.prompt = -1;
  }

  static getPrompt(prompts, index) {
    let prompt = _.findWhere(prompts, { index });
    if (prompt === undefined) prompt = _.first(prompts);
    return prompt;
  }

  loadListeners() {
    $('.start').on('click', (e) => {
      $('.app').addClass('active');
      $('.intro').removeClass('active');
    });

    $('.close-modal').on('click', (e) => {
      $(e.currentTarget).closest('.modal').removeClass('active');
    });

    $('.next-prompt').on('click', (e) => {
      this.renderNextPrompt();
    });

    $('.dropdown-selected').on('click', (e) => {
      this.constructor.toggleMenu($(e.currentTarget));
    });

    $('.dropdown-list-item').on('click', (e) => {
      this.onFilter($(e.currentTarget));
    });

    this.$main.on('click', '.show-doc', (e) => {
      const $button = $(e.currentTarget);
      const index = parseInt($button.attr('data-index'), 10);
      this.showDocument(index);
    });

    this.$main.on('click', '.bookmark-prompt', (e) => {
      const $button = $(e.currentTarget);
      $button.toggleClass('active');
      if ($button.hasClass('active')) this.savePrompt();
      else this.unsavePrompt();
    });

    this.$main.on('click', '.view-saved-prompts', (e) => {
      this.renderSavedPrompts();
    });

    this.$main.on('click', '.remove-saved-prompt', (e) => {
      const $button = $(e.currentTarget);
      const index = parseInt($button.attr('data-index'), 10);
      this.unsavePrompt(index);
      this.renderSavedPrompts();
    });

    $('.download-saved-prompts').on('click', (e) => {
      this.downloadSavedPrompts();
    });

    this.$statePrev.on('click', (e) => {
      window.history.back();
    });

    this.$stateNext.on('click', (e) => {
      window.history.forward();
    });

    window.addEventListener('popstate', (event) => {
      this.onPopState(event.state);
    });
  }

  loadFilters() {
    const dataFilters = {};
    $('.data-option').each((i, el) => {
      const name = el.getAttribute('data-name');
      const value = el.getAttribute('data-value');
      if (_.has(dataFilters, name)) {
        dataFilters[name].values.push(value);
      } else {
        dataFilters[name] = { values: [value] };
      }
    });
    this.dataFilters = dataFilters;
  }

  onFilter($selectButton) {
    this.constructor.renderFilterSelect($selectButton);
    const name = $selectButton.attr('data-name');
    const value = $selectButton.attr('data-value');
    this.state.filters[name] = value;
    this.filterPrompts();
  }

  onImageLoad(images) {
    const $container = $('#collage');
    const containerW = $container.width();
    const containerH = $container.height();
    const imageData = images.map((image, i) => ({ i, image }));
    images.forEach((image, i) => {
      const $image = $(image);
      imageData[i].$image = $image;
      const x = parseFloat($image.attr('data-x'));
      const y = parseFloat($image.attr('data-y'));
      imageData[i].x = x;
      imageData[i].y = y;
      // move images toward the center to start
      const deltaX = (0.5 - x) * containerW;
      let deltaY = containerH;
      if (y < 0.5) deltaY = -containerH;
      $image.css({
        transform: `translate(${deltaX}px, ${deltaY}px)`,
      });
      // animate the images back to the original position
      const transitionDuration = MathUtil.lerp(0.5, 2, Math.random());
      const delayN = (0.5 - Math.abs(0.5 - x)) * 2; // delay longer for images in center
      const delayDuration = parseInt(MathUtil.lerp(100, 1000, delayN), 10);
      setTimeout(() => {
        $image.css({
          opacity: 1,
          transition: `opacity ${transitionDuration}s ease-in-out, transform ${transitionDuration}s ease-in-out`,
          transform: 'translate(0, 0)',
        });
      }, delayDuration);
    });

    const $window = $(window);
    let windowW = $window.width();
    let windowH = $window.height();
    $window.on('resize', (e) => {
      windowW = $window.width();
      windowH = $window.height();
    });

    setTimeout(() => {
      $container.css('opacity', '0.333');
      this.$intro.addClass('active');
      $('.collage-image').css('transition', 'none');
      // move the images when the mouse moves
      this.$main.on('mousemove', (e) => {
        const { clientX, clientY } = e;
        let nx = MathUtil.clamp(clientX / windowW);
        let ny = MathUtil.clamp(clientY / windowH);
        nx = MathUtil.lerp(1, -1, nx);
        ny = MathUtil.lerp(1, -1, ny);
        imageData.forEach((im) => {
          const { $image, x, y } = im;
          const imx = MathUtil.lerp(-1, 1, x);
          const imy = MathUtil.lerp(-1, 1, y);
          const dx = imx * nx;
          const dy = imy * ny;
          const deltaX = dx * 50;
          const deltaY = dy * 50;
          $image.css('transform', `translate(${deltaX}px, ${deltaY}px)`);
        });
      });
    }, 3000);
  }

  onPopState(state) {
    this.setState(state);
    this.filterPrompts(false);
    this.renderFilters();
    this.renderPrompt();

    // activate or deactivate prev/next buttons based on where we are in state history
    const stateString = $.param(state);
    let stateIndex = _.indexOf(this.stateHistory, stateString);
    // state not found; probably from previous history
    if (stateIndex < 0) {
      // add it to the beginning of the history
      this.stateHistory.unshift(stateString);
      stateIndex = 0;
    }
    this.stateIndex = stateIndex;
    this.renderStateButtons();
  }

  onPromptDataLoad(data) {
    console.log('Prompt data loaded.');

    this.prompts = DataUtil.loadCollectionFromRows(data.prompts, (prompt) => {
      const updatedPrompt = prompt;
      // updatedPrompt.Project = prompt.Project.replace(/:.+/i, '');
      updatedPrompt.itemUrl = `https://www.loc.gov/resource/${prompt.ResourceID}/?sp=${prompt.ItemAssetIndex}&st=text`;
      return updatedPrompt;
    }, true);
    this.filterPrompts(false);
    this.timeRange = data.timeRange;
    this.subCollections = data.subCollections;

    // this.printBuckets();

    this.promptDataLoaded = true;
    this.$main.removeClass('is-loading');
    if (this.state.prompt >= 0) {
      this.renderPrompt();
      this.pushState();
    } else this.renderNextPrompt();
    this.loadListeners();
  }

  onTranscriptDataLoad(transcriptData) {
    this.documents = DataUtil.loadCollectionFromRows(transcriptData, (doc) => {
      const updatedDoc = doc;
      updatedDoc.id = doc.index;
      updatedDoc.itemUrl = `https://www.loc.gov/resource/${doc.ResourceID}/?sp=${doc.ItemAssetIndex}&st=text`;
      updatedDoc.DownloadUrl = `https://tile.loc.gov/image-services/iiif/${doc.DownloadUrl}/full/pct:100/0/default.jpg`;
      return updatedDoc;
    }, true);
    console.log('Transcript data loaded.');
    this.transcriptsLoaded = true;
  }

  static preloadImage(url) {
    const img = new Image();
    img.src = url;
  }

  printBuckets() {
    const { dataFilters, prompts } = this;
    const buckets = [];
    const promptFilter = (prompt, key, value) => {
      if (Array.isArray(value)) {
        return prompt[key] === '' || (prompt[key] >= value[0] && prompt[key] < value[1]);
      }
      return prompt[key] === value;
    };
    let level = 0;
    _.each(dataFilters, (dataFilter, key) => {
      const entries = dataFilter.values;
      level += 1;
      entries.forEach((value) => {
        const bucketKey = (typeof value === 'string') ? value : value.toString();
        if (level === 1) {
          const matches = _.filter(prompts, (prompt) => promptFilter(prompt, key, value));
          buckets.push({ bname: bucketKey, bprompts: matches, blevel: level });
        } else {
          buckets.forEach(({ bname, bprompts, blevel }) => {
            if (blevel === (level - 1)) {
              const newKey = `${bname}-${bucketKey}`;
              const newPrompts = _.filter(bprompts, (prompt) => promptFilter(prompt, key, value));
              buckets.push({ bname: newKey, bprompts: newPrompts, blevel: level });
            }
          });
        }
      });
    });

    const printBuckets = buckets.filter((bucket) => bucket.blevel === level);
    console.log(printBuckets);
  }

  pushState() {
    const { state, defaultState } = this;
    const urlState = {};
    _.each(state.filters, (value, key) => {
      if (defaultState.filters[key] !== value) {
        urlState[key] = value;
      }
      if (state.prompt !== defaultState.prompt) urlState.prompt = state.prompt;
    });
    // console.log(state, defaultState, urlState);
    StringUtil.pushURLState(urlState);

    // keep track of state
    const newStateHistory = this.stateIndex >= 0
      ? this.stateHistory.slice(0, this.stateIndex + 1)
      : this.stateHistory.slice();
    newStateHistory.push($.param(urlState));
    this.stateHistory = newStateHistory;
    this.stateIndex = this.stateHistory.length - 1;
    this.renderStateButtons();
  }

  renderBookmarkButton() {
    const { savedPrompts } = this;
    const $button = $('.view-saved-prompts');
    if (savedPrompts.length > 0) {
      $button.text(savedPrompts.length.toLocaleString()).addClass('active');
    } else {
      $button.removeClass('active');
    }
  }

  renderDocument(promptIndex = false) {
    const {
      documents, $documentModal, state, filteredPrompts, prompts,
    } = this;
    let prompt;
    if (promptIndex !== false) {
      prompt = this.constructor.getPrompt(prompts, promptIndex);
    } else {
      prompt = this.constructor.getPrompt(filteredPrompts, state.prompt);
    }
    const doc = documents[prompt.doc];
    const $document = $documentModal.find('#document-container');
    const $title = $documentModal.find('.resource-link');
    const text = doc.Transcription.replace(/\s+/g, ' ').replace(/\s\s+/g, ' ');
    const matchText = text.replace(prompt.text, `</span><strong>${prompt.text}</strong><span>`);
    let html = '';
    html += `<div id="transcript-pane" class="pane transcript"><p><span>${matchText}</span></p></div>`;
    html += `<div class="pane image" style="background-image: url(${doc.DownloadUrl})"></div>`;
    $document.html(html);
    $title.text(doc.Item);
    $title.attr('href', doc.itemUrl);
    // this.constructor.preloadImage(doc.DownloadUrl);
    // check if highligthed text is visible
    setTimeout(() => {
      const $pane = $('#transcript-pane');
      const $highlighted = $pane.find('strong').first();
      if ($highlighted.length > 0) {
        const $transcript = $pane.find('p').first();
        const pHeight = $pane.height();
        const highlightedY = $highlighted.position().top;
        const thresholdTop = pHeight * 0.667;
        const targetTop = pHeight * 0.4;
        if (highlightedY > thresholdTop) {
          // console.log(highlightedY, thresholdTop);
          const tHeight = $transcript.height();
          const maxTop = tHeight - pHeight;
          const pScrollTop = Math.min(highlightedY - targetTop, maxTop);
          if (pScrollTop > 0) {
            $pane.scrollTop(pScrollTop);
          }
        }
      }
    }, 100);
  }

  renderFilters() {
    _.each(this.state.filters, (value, key) => {
      const $button = $(`.data-option[data-name="${key}"][data-value="${value}"]`).first();
      this.constructor.renderFilterSelect($button);
    });
  }

  static renderFilterSelect($selectButton) {
    const $dropdown = $selectButton.closest('.dropdown');
    const $selected = $dropdown.find('.dropdown-selected');
    $dropdown.find('.dropdown-list-item').attr('aria-selected', 'false');
    $selectButton.attr('aria-selected', 'true');
    $selected.text($selectButton.find('.option-title').text());
    $selected.attr('aria-expanded', 'false');
    $dropdown.find('.dropdown-list')[0].hidden = true;
  }

  renderNextPrompt() {
    const index = _.findIndex(this.filteredPrompts, (p) => p.index === this.state.prompt);
    let newIndex = index + 1;
    if (newIndex >= this.filteredPrompts.length) newIndex = 0;
    this.state.prompt = this.filteredPrompts[newIndex].index;
    this.renderPrompt();
    this.pushState();
  }

  renderPrompt() {
    const { state, filteredPrompts, savedPrompts } = this;
    const prompt = this.constructor.getPrompt(filteredPrompts, state.prompt);
    const isSaved = _.find(savedPrompts, (p) => p.index === prompt.index);
    let html = '';
    html += '<p>';
    html += prompt.text;
    html += '<span class="prompt-actions">';
    html += '<button class="show-doc" title="View in context">';
    html += '<span class="visually-hidden">View in context</span>';
    html += '<svg class="zoom-in-icon" width="24" height="24" viewBox="0 0 24 24">';
    html += '<path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>';
    html += '</svg></button>';
    html += `<button class="bookmark-prompt ${(isSaved ? 'active' : '')}" title="Save prompt" data-index="${prompt.index}">`;
    html += '<span class="visually-hidden">Save prompt</span>';
    html += '<svg class="bookmark-icon" width="24" height="24" viewBox="0 0 24 24">';
    html += '<path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/>';
    html += '</svg></button>';
    html += `<button class="view-saved-prompts ${(savedPrompts.length > 0 ? 'active' : '')}" title="View saved prompts">`;
    html += savedPrompts.length.toLocaleString();
    html += '</button>';
    html += '</span>';
    html += '</p>';
    this.$prompt.html(html);

    html = '';
    html += '<h2>Mary Church Terrell Papers</h2>';
    html += `<h3>${prompt.Item} <button class="show-doc">View in context</button></h3>`;
    this.$meta.html(html);

    this.renderDocument();
  }

  renderSavedPrompts() {
    const { savedPrompts } = this;
    if (savedPrompts.length <= 0) return;
    const $modal = $('#saved-prompts');
    const $container = $('#saved-prompts-container');
    let html = '';
    savedPrompts.forEach(({ text, index, itemUrl }) => {
      html += '<div class="saved-prompt">';
      html += `<div class="text">${text}</div>`;
      html += `<button class="show-doc" data-index="${index}">View in context</button>`;
      html += `<a href="${itemUrl}" class="button" target="_blank">View on loc.gov</a>`;
      html += `<button class="remove-saved-prompt" data-index="${index}">Remove</button>`;
      html += '</div>';
    });
    $container.html(html);
    $modal.addClass('active');
  }

  renderStateButtons() {
    const { stateIndex, stateHistory } = this;
    if (stateIndex >= (stateHistory.length - 1)) this.$stateNext.removeClass('active');
    else this.$stateNext.addClass('active');
    if (stateIndex <= 0) this.$statePrev.removeClass('active');
    else this.$statePrev.addClass('active');
  }

  savePrompt() {
    const { state, filteredPrompts } = this;
    const prompt = this.constructor.getPrompt(filteredPrompts, state.prompt);
    // check if already saved
    if (_.find(this.savedPrompts, (p) => p.index === prompt.index)) return;
    const promptData = _.pick(prompt, 'text', 'index', 'itemUrl');
    this.savedPrompts.push(promptData);
    StringUtil.saveToStorage('saved-prompts', this.savedPrompts);
    this.renderBookmarkButton();
  }

  setState(data) {
    const state = structuredClone(this.defaultState);
    _.each(state.filters, (value, name) => {
      if (_.has(data, name)) {
        state.filters[name] = data[name];
      }
    });
    if (_.has(data, 'prompt')) state.prompt = parseInt(data.prompt, 10);
    this.state = state;
  }

  showDocument(promptIndex) {
    if (promptIndex) {
      this.renderDocument(promptIndex);
    }
    this.$documentModal.addClass('active');
  }

  static toggleMenu($menuButton) {
    const value = $menuButton.attr('aria-expanded');
    const controls = $menuButton.attr('aria-controls');
    const sublist = $(`#${controls}`)[0];
    if (value === 'true') {
      $menuButton.attr('aria-expanded', 'false');
      sublist.hidden = true;
    } else {
      $menuButton.attr('aria-expanded', 'true');
      sublist.hidden = false;
    }
  }

  unsavePrompt(promptIndex = false) {
    const { state, filteredPrompts, prompts } = this;
    let prompt;
    if (promptIndex) {
      prompt = this.constructor.getPrompt(prompts, promptIndex);
      $(`.bookmark-prompt[data-index="${promptIndex}"]`).removeClass('active');
    } else prompt = this.constructor.getPrompt(filteredPrompts, state.prompt);
    this.savedPrompts = _.reject(this.savedPrompts, (p) => p.index === prompt.index);
    StringUtil.saveToStorage('saved-prompts', this.savedPrompts);
    this.renderBookmarkButton();
  }
}

(function initApp() {
  const app = new App({});
}());