import { App, FuzzySuggestModal, Notice, Plugin, SuggestModal, WorkspaceLeaf, View, TFile, addIcon, setIcon } from "obsidian";

declare module "obsidian" {
    interface WorkspaceLeaf {
        tabHeaderInnerIconEl: HTMLElement;
        id: any;
    }
    interface Notice {
        noticeEl: HTMLElement;
    }
    interface View {
        backlink: any;
        loadFile(fileObj: TFile): Promise<void>;
    }
    interface App {
        viewRegistry: any;
    }
}
const pluginName = 'Backlinks Filtering';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
    BlFilterIdSetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    BlFilterIdSetting: ""
};

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;
    myBlFilterId: string;
    filterArr: Array<any>;
    origFilterArr: Array<any>;
    origFilterArrAll: Array<any>;
    selectedFiltArr: Array<any>;
    headingsArr: Array<any>;
    noticeArr: Array<any>;
    openModal: any;
    noticeStylePos: string;
    iconName: string;

    async onload() {
        console.log("loading plugin: " + pluginName);

        this.iconName = "filter-icon";
        const FILTER_ICON = `<path fill="currentColor" stroke="currentColor" d="M7.6,4C6.7,4.2,6,5,6,6v6c0,0.5,0.2,1,0.6,1.4L38,46.7V82c0,0.7,0.4,1.3,1,1.7l20,12c0.6,0.4,1.4,0.4,2,0 c0.6-0.3,1-1,1-1.7V46.7l31.1-33.1c0,0,0,0,0.1-0.1l0.3-0.3c0.1-0.1,0.2-0.2,0.2-0.3c0,0,0.1-0.1,0.1-0.1c0.1-0.3,0.2-0.5,0.2-0.8 c0,0,0-0.1,0-0.1c0-0.1,0-0.2,0-0.3V6c0-1.1-0.9-2-2-2H8C7.9,4,7.9,4,7.8,4C7.7,4,7.7,4,7.6,4L7.6,4z M10,8h80v3.3L59.1,44H40.9 L10,11.2L10,8z M42,48h16v42.5l-16-9.6L42,48z"/>`;
        addIcon(this.iconName, FILTER_ICON);

        this.myBlFilterId = "";
        this.filterArr = [];
        this.origFilterArr = [];
        this.origFilterArrAll = [];
        this.selectedFiltArr = [];
        this.headingsArr = [];
        this.noticeArr = [];
        this.openModal = null;
        this.noticeStylePos = "";

        let newNotice: Notice = new Notice('', 10000);
        newNotice.noticeEl.style.backgroundColor = 'transparent';
        let noticeCont: HTMLElement = document.querySelector('.notice-container');
        if (noticeCont) {
            //Save the default notice position settings
            let cssStyle = getComputedStyle(noticeCont);
            let inlineStyle = noticeCont.style.cssText;
            this.noticeStylePos = inlineStyle;
        }
        newNotice.hide();

        this.registerView("backlink-filter", (leaf: WorkspaceLeaf) => {
            const newView: View = this.app.viewRegistry.getViewCreatorByType("backlink")(leaf);
            newView.getViewType = () => "backlink-filter";
            return newView;
        })
        this.registerEvent(this.app.workspace.on('file-open', this.onFileChange.bind(this)));

        await this.loadSettings();

        this.addCommand({
            id: "backlinks-filter-new",
            name: "Filter Backlinks",
            // callback: () => {
            //  console.log('Simple Callback');
            // },
            checkCallback: (checking: boolean) => {
                let leaf = this.app.workspace.activeLeaf;
                if (leaf) {
                    if (!checking) {
                        loadFilter(this.app, this);
                    }
                    return true;
                }
                return false;
            },
        });

        this.addCommand({
            id: "backlinks-filter-update",
            name: "Clear Backlinks Filter",
            // callback: () => {
            //  console.log('Simple Callback');
            // },
            checkCallback: (checking: boolean) => {
                let leaf = this.app.workspace.activeLeaf;
                if (leaf) {
                    if (!checking) {
                        loadBackLinks(this.app, this);
                    }
                    return true;
                }
                return false;
            },
        });

        this.app.workspace.onLayoutReady(this.onLayoutReady.bind(this));
    }

    onFileChange(): void {
        if (this.app.workspace.layoutReady) { loadBackLinks(this.app, this); }
    }

    onLayoutReady(): void {
        loadBackLinks(this.app, this);
    }

    async onunload() {
        console.log("Unloading plugin: " + pluginName);

        updateFilterNotices(this, 2);

        this.app.workspace
            .getLeavesOfType('backlink-filter')
            .forEach((leaf: WorkspaceLeaf) => leaf.detach());
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

function switchIcon(leafTarget: WorkspaceLeaf, newIconName: string, iconColor: string = 'default') {
    const tmpContainer: HTMLElement = createDiv("div");
    setIcon(tmpContainer, newIconName);
    const newIconSvg = tmpContainer.children[0].innerHTML;
    tmpContainer.remove();
    leafTarget.tabHeaderInnerIconEl.querySelector('svg').innerHTML = newIconSvg;
    if (iconColor != 'default') { leafTarget.tabHeaderInnerIconEl.style.color = iconColor; }
    return;
}

function updateFilterNotices(thisPlugin: MyPlugin, optionNo: number) {
    //optionNo: 1 = New filter so change notice position -- 2 = Clearing all, revert position -- 3 = Revert position only
    let noticeCont: HTMLElement = document.querySelector('.notice-container');
    if (noticeCont) {
        if (optionNo != 1) {
            //Reset position of notices to default
            noticeCont.style.cssText = thisPlugin.noticeStylePos;
        } else {
            //Set position for filtering
            noticeCont.style.top = '50px';
            noticeCont.style.right = 'unset';
            noticeCont.style.left = '30px';
            noticeCont.style.bottom = 'unset';
        }
    }

    if (thisPlugin.noticeArr.length > 0 && optionNo != 1) {
        if (optionNo != 3) {
            thisPlugin.noticeArr.forEach(element => {
                element.hide();
            });
        }
        thisPlugin.noticeArr = [];
    }
}

async function loadBackLinks(thisApp: App, thisPlugin: MyPlugin) {
    //console.log('Reloading backlinks pane');
    updateFilterNotices(thisPlugin, 2);

    let viewCount = thisApp.workspace.getLeavesOfType('backlink-filter').length;
    if (viewCount > 1) {
        thisApp.workspace
            .getLeavesOfType('backlink-filter')
            .forEach((leaf: WorkspaceLeaf) => leaf.detach());
    }

    viewCount = thisApp.workspace.getLeavesOfType('backlink-filter').length;
    if (viewCount == 0) {
        let tempLeaf = thisApp.workspace.getRightLeaf(false);
        await tempLeaf.setViewState({ type: 'backlink-filter' });
    }

    let backlinkLeafNew: WorkspaceLeaf = thisApp.workspace.getLeavesOfType('backlink-filter')[0];
    let backlinkViewNew: View = backlinkLeafNew.view;

    if (backlinkViewNew.icon != thisPlugin.iconName) {
        backlinkViewNew.icon = thisPlugin.iconName;
        switchIcon(backlinkLeafNew, thisPlugin.iconName);
    }

    let backlinkViewNewBL: any;
    if (backlinkViewNew.backlink) {
        backlinkViewNewBL = backlinkViewNew.backlink;
    } else {
        backlinkViewNewBL = backlinkViewNew;
    }

    thisPlugin.myBlFilterId = backlinkLeafNew.id;
    thisPlugin.selectedFiltArr = [];
    thisPlugin.origFilterArr = [];
    thisPlugin.origFilterArrAll = [];

    let syncFile = thisApp.workspace.getActiveFile();
    await backlinkViewNew.loadFile(syncFile);
    await backlinkViewNewBL.recomputeBacklink(backlinkViewNewBL.file);
}

class inputModal extends SuggestModal<string> {
    constructor(app: App, private thisPlugin: MyPlugin) {
        super(app);
        this.setPlaceholder("Enter any keyword(s) to filter by plain text search...");
        this.setInstructions([
            { command: 'Plain Text: ', purpose: 'No [[Page]] or #Tag required' },
        ]);
    }

    onOpen() {
        let modalBg: HTMLElement = document.querySelector('.modal-bg');
        modalBg.style.backgroundColor = '#00000029';
        let modalPrompt: HTMLElement = document.querySelector('.prompt');
        modalPrompt.style.border = '1px solid #483699';
        let modalInput: any = modalPrompt.querySelector('.prompt-input');
        modalInput.focus();
        modalInput.select();
    }

    getSuggestions(query: string): string[] {
        return [query];
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        el.innerText = value;
    }

    onChooseSuggestion(item: string, _: MouseEvent | KeyboardEvent): void {
        processFilterSelection(this.app, this.thisPlugin, item, 'custom');
    }
}

class ModalSelectBlFilter extends FuzzySuggestModal<string> {
    constructor(app: App, private linkSuggArr: Array<any>, private thisPlugin: MyPlugin) {
        super(app);
        this.setInstructions([
            { command: '(X|Y)', purpose: 'Counts' },
            { command: 'X:', purpose: 'File count' },
            { command: 'Y:', purpose: 'Total occurrences' },
        ]);
    }

    getItems(): string[] {
        //Runs one time for every character you type in modal
        let modalBg: HTMLElement = document.querySelector('.modal-bg');
        modalBg.style.backgroundColor = '#00000029';
        let modalPrompt: HTMLElement = document.querySelector('.prompt');
        modalPrompt.style.border = '1px solid #483699';

        return this.linkSuggArr;
    }

    getItemText(item: string): string {
        //Runs every character you type ~85 times, so do NOT add code in here
        return item;
    }

    onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
        processFilterSelection(this.app, this.thisPlugin, item, 'fuzzy');
    }
}

async function processFilterSelection(thisApp: App, thisPlugin: MyPlugin, filterItem: string, modalType: string) {
    //console.log(filterItem);
    let filterArray: Array<any> = thisPlugin.filterArr;
    let pageName: Array<any> = [];
    let foundSettingId = thisPlugin.myBlFilterId;
    let backlinkLeafNew: WorkspaceLeaf = thisApp.workspace.getLeafById(foundSettingId);
    let backlinkViewNew: View = backlinkLeafNew.view;

    let backlinkViewNewBL: any;
    if (backlinkViewNew.backlink) {
        backlinkViewNewBL = backlinkViewNew.backlink;
    } else {
        backlinkViewNewBL = backlinkViewNew;
    }

    if (modalType == 'custom') {
        pageName = [filterItem];
        //Add to the master array any matches from the custom keyword
        let blHeadArr: Array<any> = thisPlugin.headingsArr;

        let filesRemaining: Array<TFile> = backlinkViewNewBL.backlinkDom.getFiles();

        for (let m = 0; m < filesRemaining.length; m++) {
            let eachFile: TFile = filesRemaining[m];
            let filePath: string = eachFile.path;
            let fileContents: string = (await thisApp.vault.cachedRead(eachFile)).toLowerCase();
            let foundLoc = fileContents.indexOf(filterItem.toLowerCase());

            if (foundLoc > -1) {
                let blHeadFilteredArr: Array<any> = blHeadArr.filter(eachItem => eachItem[0] == filePath);
                if (blHeadFilteredArr.length > 0) {
                    let foundKeyword: boolean = false;
                    while (!foundKeyword && foundLoc > -1) {
                        blHeadFilteredArr.forEach(eachHead => {
                            let headStart = eachHead[2];
                            let headEnd = eachHead[3];
                            if (foundLoc >= headStart && foundLoc <= headEnd) {
                                thisPlugin.origFilterArr.push([filePath, filterItem]);
                                thisPlugin.origFilterArrAll.push([filePath, filterItem]);
                                foundKeyword = true;
                            }
                        });
                        foundLoc = fileContents.indexOf(filterItem.toLowerCase(), foundLoc + 1);
                        //console.log('found loc: ' + foundLoc);
                    }
                } else {
                    let allHeaders = thisApp.metadataCache.getCache(filePath).headings;
                    if (!allHeaders) {
                        thisPlugin.origFilterArr.push([filePath, filterItem]);
                        thisPlugin.origFilterArrAll.push([filePath, filterItem]);
                    }
                }
            }
        }
        //console.log(thisPlugin.origFilterArr);
    } else {
        if (filterItem == '*Custom Keyword Search*') {
            thisPlugin.openModal.close();
            thisPlugin.openModal = new inputModal(thisApp, thisPlugin);
            thisPlugin.openModal.open();
            return;
        } else {
            pageName = filterArray.find(eachItem => {
                let thisVal = eachItem[0] + ' (' + eachItem[1] + '|' + eachItem[2] + ')';
                return thisVal == filterItem;
            });
        }
    }

    //console.log(pageName[0]);

    thisPlugin.selectedFiltArr.push(pageName[0]);
    let newNotice: Notice = new Notice(filterItem, 2000000);
    newNotice.noticeEl.dataset.pageName = pageName[0];
    newNotice.noticeEl.addClass('bl-filter');

    newNotice.noticeEl.onclick = async (event) => {
        let evtTarg: any = event.target;
        let filterValue: string = evtTarg.dataset.pageName;
        //console.log('remove filter: ' + filterValue);
        let foundItem = thisPlugin.noticeArr.find(eachNotice => { if (eachNotice.noticeEl.dataset.pageName == filterValue) { return true } })
        let noticeIndex = -1;
        if (foundItem) { noticeIndex = thisPlugin.noticeArr.indexOf(foundItem) }
        if (noticeIndex > -1) {
            if (thisPlugin.noticeArr.length == 1) {
                updateFilterNotices(thisPlugin, 3);
            } else {
                thisPlugin.noticeArr.splice(noticeIndex, 1);
            }
        }

        thisPlugin.openModal.close();
        let indexFound = thisPlugin.selectedFiltArr.indexOf(filterValue);
        thisPlugin.selectedFiltArr.splice(indexFound, 1);
        let foundSettingId = thisPlugin.myBlFilterId;
        let backlinkLeafNew: WorkspaceLeaf = thisApp.workspace.getLeafById(foundSettingId);
        let backlinkViewNew: View = backlinkLeafNew.view;

        let backlinkViewNewBL: any;
        if (backlinkViewNew.backlink) {
            backlinkViewNewBL = backlinkViewNew.backlink;
        } else {
            backlinkViewNewBL = backlinkViewNew;
        }

        await backlinkViewNewBL.recomputeBacklink(backlinkViewNewBL.file);

        let mySleep = (mSleep: any) => new Promise(rSleep => setTimeout(rSleep, mSleep));
        //Found no other way than to check the .running every 100 ms until completed. Max 20 times (2 seconds) just in case
        for (let x = 0; x < 20; x++) {
            if (backlinkViewNewBL.backlinkQueue.runnable.running) {
                await mySleep(100);
            } else {
                break;
            }
        }
        await mySleep(50);

        let blLinksArr: Array<any> = thisPlugin.origFilterArrAll;
        thisPlugin.selectedFiltArr.forEach((filteredItem: string) => {
            let blItemsFiltArr = blLinksArr.filter(eachItem => eachItem[1] == filteredItem);

            //if (backlinkViewNewBL.collapseAllButtonEl.classList.contains('is-active') == false) { backlinkViewNewBL.collapseAllButtonEl.click() }
            //Loop through the backlinks and if a file doesn't match the blItemsFiltArr then remove
            backlinkViewNewBL.backlinkDom.resultDomLookup.forEach((eachBlItem: any) => {
                let foundItems: Array<any> = [];
                let thisFile = eachBlItem.file;
                foundItems = blItemsFiltArr.filter(eachItem => eachItem[0] == thisFile.path);
                if (foundItems.length == 0) {
                    let curCount = eachBlItem.result.content.length;
                    backlinkViewNewBL.backlinkDom.removeResult(eachBlItem.file);
                    backlinkViewNewBL.backlinkCountEl.textContent = (backlinkViewNewBL.backlinkCountEl.textContent - curCount).toString();
                }
            });
        });

        let linkSuggArr: Array<any> = [];
        let linkSuggCtrArr: Array<any> = [];

        blLinksArr.forEach(eachItem => {
            if (!linkSuggArr.includes(eachItem[1])) {
                linkSuggArr.push(eachItem[1]);
                linkSuggCtrArr.push([eachItem[1], 1]);
            } else {
                let foundIndex = linkSuggCtrArr.findIndex(eachLinkItem => eachLinkItem[0] == eachItem[1]);
                let oldValue = linkSuggCtrArr[foundIndex][1];
                linkSuggCtrArr[foundIndex][1] = oldValue + 1;
            }
        });

        let newLinkSuggArr: Array<any> = [];
        let itemsRemaining = linkSuggCtrArr.filter(eachItem => !thisPlugin.selectedFiltArr.includes(eachItem[0]));

        itemsRemaining.sort(function (a, b) { return b[1] - a[1] });
        itemsRemaining.forEach(eachItem => {
            let itemWithCount = eachItem[0] + ' (' + eachItem[1] + ')';
            if (!newLinkSuggArr.includes(itemWithCount)) { newLinkSuggArr.push(itemWithCount); }
        });

        thisPlugin.filterArr = linkSuggCtrArr;
    }

    thisPlugin.noticeArr.push(newNotice);
    if (thisPlugin.noticeArr.length == 1) { updateFilterNotices(thisPlugin, 1); }

    let blItemsArr: Array<any> = thisPlugin.origFilterArr;
    let blItemsFiltArr = blItemsArr.filter(eachItem => eachItem[1] == pageName[0]);
    /*
    console.log(blItemsArr);
    console.log(blItemsFiltArr);
    */

    //if (backlinkViewNewBL.collapseAllButtonEl.classList.contains('is-active') == false) { backlinkViewNewBL.collapseAllButtonEl.click() }

    //Loop through the backlinks and if a file doesn't match the blItemsFiltArr then remove
    backlinkViewNewBL.backlinkDom.resultDomLookup.forEach((eachBlItem: any) => {
        let foundItems: Array<any> = [];
        let thisFile = eachBlItem.file;
        foundItems = blItemsFiltArr.filter(eachItem => eachItem[0] == thisFile.path);
        if (foundItems.length == 0) {
            let curCount = eachBlItem.result.content.length;
            backlinkViewNewBL.backlinkDom.removeResult(eachBlItem.file);
            backlinkViewNewBL.backlinkCountEl.textContent = (backlinkViewNewBL.backlinkCountEl.textContent - curCount).toString();
        }
    });

    loadFilter(thisApp, thisPlugin);
}

async function loadFilter(thisApp: App, thisPlugin: MyPlugin) {
    //console.log("loadFilter");
    let viewCount = thisApp.workspace.getLeavesOfType('backlink-filter').length;
    if (viewCount != 1) {
        await loadBackLinks(thisApp, thisPlugin);
    }

    let foundSettingId = thisPlugin.myBlFilterId;
    let backlinkLeafNew: WorkspaceLeaf = thisApp.workspace.getLeafById(foundSettingId);
    let backlinkViewNew: View = backlinkLeafNew.view;

    let backlinkViewNewBL: any;
    if (backlinkViewNew.backlink) {
        backlinkViewNewBL = backlinkViewNew.backlink;
    } else {
        backlinkViewNewBL = backlinkViewNew;
    }

    thisApp.workspace.revealLeaf(backlinkLeafNew);

    if (viewCount != 1) {
        await loadBackLinks(thisApp, thisPlugin);

        let mySleep = (mSleep: any) => new Promise(rSleep => setTimeout(rSleep, mSleep));
        for (let x = 0; x < 20; x++) {
            if (backlinkViewNewBL.backlinkQueue.runnable.running) {
                await mySleep(100);
            } else {
                break;
            }
        }
        await mySleep(50);
    }

    //if (backlinkViewNewBL.collapseAllButtonEl.classList.contains('is-active') == false) { backlinkViewNewBL.collapseAllButtonEl.click() }

    let curPageName = backlinkViewNewBL.file.basename;
    let curPagePath = backlinkViewNewBL.file.path.replace(backlinkViewNewBL.file.name, curPageName);
    //console.log(curPageName);

    let blLinksArr: Array<any> = [];
    let blTagsArr: Array<any> = [];
    let blYAMLArr: Array<any> = [];
    let blHeadingsArr: Array<any> = [];

    backlinkViewNewBL.backlinkDom.resultDomLookup.forEach((eachItem: any) => {
        //Looping each file with a match in backlinks
        let thisFile = eachItem.file;
        let mdCache = thisApp.metadataCache.getCache(thisFile.path);
        let allLinks = mdCache.links;
        let allHeaders = mdCache.headings;
        let allTags = mdCache.tags;
        let allYAML = mdCache.frontmatter;
        let firstHeader: number = -1;
        if (allHeaders) { firstHeader = allHeaders[0].position.start.offset; }
        let endOfFileCharOffset: number = thisFile.stat.size;
        let eachHeadAddedArr: Array<number> = [];

        eachItem.result.content.forEach((eachRes: any) => {
            //Looping each backlink match location in each file (each result)
            //console.log(eachItem.file.path);
            let blPos = eachRes;
            let headLvl = 0;
            let blHeadArr: Array<any> = [];

            //If there are headers on your page vs just text without any headers
            if (allHeaders) {
                //If there is any text above the first header on the page with a backlink page ref in it, add items for filtering
                if (firstHeader > 1 && blPos[0] < firstHeader) {
                    if (!eachHeadAddedArr.includes(firstHeader)) {
                        blHeadArr.push([0, 0, firstHeader]);
                        blHeadingsArr.push([eachItem.file.path, 0, 0, firstHeader]);
                        eachHeadAddedArr.push(firstHeader);
                    }
                }

                if (blPos[0] >= firstHeader) {
                    //Look through all the headers to populate the "related" parent/child header sections
                    for (let h = 0; h < allHeaders.length; h++) {
                        let eachHead = allHeaders[h];
                        if (blPos[0] < eachHead.position.start.offset) {
                            let nextParent = headLvl;
                            //Now look through the headers "above" the backlink location... aka parents
                            for (let i = (h - 1); i >= 0; i--) {
                                if (allHeaders[i].level <= nextParent) {
                                    if (i < h - 1 && allHeaders[i].level < headLvl - 1) {
                                        if (!eachHeadAddedArr.includes(allHeaders[i].position.end.offset)) {
                                            blHeadArr.push([allHeaders[i].level, allHeaders[i].position.start.offset, allHeaders[i].position.end.offset]);
                                            blHeadingsArr.push([eachItem.file.path, allHeaders[i].level, allHeaders[i].position.start.offset, allHeaders[i].position.end.offset]);
                                            eachHeadAddedArr.push(allHeaders[i].position.end.offset);
                                        }
                                    } else {
                                        if (!eachHeadAddedArr.includes(allHeaders[i + 1].position.start.offset)) {
                                            blHeadArr.push([allHeaders[i].level, allHeaders[i].position.start.offset, allHeaders[i + 1].position.start.offset]);
                                            blHeadingsArr.push([eachItem.file.path, allHeaders[i].level, allHeaders[i].position.start.offset, allHeaders[i + 1].position.start.offset]);
                                            eachHeadAddedArr.push(allHeaders[i + 1].position.start.offset);
                                        }
                                    }
                                    nextParent--;
                                }
                                if (nextParent <= 0) { break; }
                            }

                            //Now look through the headers "below" the backlink location... aka children
                            for (let i = h; i < allHeaders.length; i++) {
                                if (allHeaders[i].level > headLvl) {
                                    if (allHeaders[i + 1]) {
                                        if (!eachHeadAddedArr.includes(allHeaders[i + 1].position.start.offset)) {
                                            blHeadArr.push([allHeaders[i].level, allHeaders[i].position.start.offset, allHeaders[i + 1].position.start.offset]);
                                            blHeadingsArr.push([eachItem.file.path, allHeaders[i].level, allHeaders[i].position.start.offset, allHeaders[i + 1].position.start.offset]);
                                            eachHeadAddedArr.push(allHeaders[i + 1].position.start.offset);
                                        }
                                    } else {
                                        if (!eachHeadAddedArr.includes(endOfFileCharOffset)) {
                                            blHeadArr.push([allHeaders[i].level, allHeaders[i].position.start.offset, endOfFileCharOffset]);
                                            blHeadingsArr.push([eachItem.file.path, allHeaders[i].level, allHeaders[i].position.start.offset, endOfFileCharOffset]);
                                            eachHeadAddedArr.push(endOfFileCharOffset);
                                        }
                                    }
                                } else { break; }
                            }

                            break;
                        } else {
                            //This accounts for when the backlink is found under the very last header on the page
                            headLvl = eachHead.level;
                            if (h == allHeaders.length - 1) {
                                if (blPos[0] < endOfFileCharOffset && blPos[0] > eachHead.position.start.offset && !eachHeadAddedArr.includes(endOfFileCharOffset)) {
                                    blHeadArr.push([eachHead.level, eachHead.position.start.offset, endOfFileCharOffset]);
                                    blHeadingsArr.push([eachItem.file.path, eachHead.level, eachHead.position.start.offset, endOfFileCharOffset]);
                                    eachHeadAddedArr.push(endOfFileCharOffset);

                                    let nextParent = headLvl;
                                    //Now look through the headers "above" the backlink location... aka parents
                                    for (let i = (h - 1); i >= 0; i--) {
                                        if (allHeaders[i].level <= nextParent) {
                                            if (i < h - 1 && allHeaders[i].level < headLvl - 1) {
                                                //h - 1 means the direct parent one level up.
                                                //It will only grab links / tags from sub text of a header when direct parent.
                                                //Other levels more than 1 levels above will only grab links / tags from the header itself.
                                                if (!eachHeadAddedArr.includes(allHeaders[i].position.end.offset)) {
                                                    blHeadArr.push([allHeaders[i].level, allHeaders[i].position.start.offset, allHeaders[i].position.end.offset]);
                                                    blHeadingsArr.push([eachItem.file.path, allHeaders[i].level, allHeaders[i].position.start.offset, allHeaders[i].position.end.offset]);
                                                    eachHeadAddedArr.push(allHeaders[i].position.end.offset);
                                                }
                                            } else {
                                                if (!eachHeadAddedArr.includes(allHeaders[i + 1].position.start.offset)) {
                                                    blHeadArr.push([allHeaders[i].level, allHeaders[i].position.start.offset, allHeaders[i + 1].position.start.offset]);
                                                    blHeadingsArr.push([eachItem.file.path, allHeaders[i].level, allHeaders[i].position.start.offset, allHeaders[i + 1].position.start.offset]);
                                                    eachHeadAddedArr.push(allHeaders[i + 1].position.start.offset);
                                                }
                                            }
                                            nextParent--;
                                        }
                                        if (nextParent <= 0) { break; }
                                    }
                                }
                            }
                        }
                    }
                }
                blHeadArr.forEach(eachHead => {
                    if (allLinks) {
                        allLinks.forEach(eachLink => {
                            if (curPageName != eachLink.link && curPagePath != eachLink.link && eachHead[1] <= eachLink.position.start.offset && eachHead[2] >= eachLink.position.end.offset) {
                                blLinksArr.push([eachItem.file.path, eachLink.link]);
                            }
                        });
                    }

                    if (allTags) {
                        allTags.forEach(eachTag => {
                            if (eachHead[1] <= eachTag.position.start.offset && eachHead[2] >= eachTag.position.end.offset) {
                                blTagsArr.push([eachItem.file.path, eachTag.tag]);
                            }
                        });
                    }
                });
            } else {
                //console.log('no headers in page so include all links and tags from page');
                if (!eachHeadAddedArr.includes(-1)) {
                    if (allLinks) {
                        allLinks.forEach(eachLink => {
                            if (curPageName != eachLink.link && curPagePath != eachLink.link) {
                                blLinksArr.push([eachItem.file.path, eachLink.link]);
                                eachHeadAddedArr.push(-1);
                            }
                        });
                    }

                    if (allTags) {
                        allTags.forEach(eachTag => {
                            blTagsArr.push([eachItem.file.path, eachTag.tag]);
                            eachHeadAddedArr.push(-1);
                        });
                    }
                }
            }
        });

        //Add YAML from each file
        if (allYAML) {
            Object.entries(allYAML).forEach((eachMeta: any) => {
                if (eachMeta[0] != 'position' && eachMeta[1] != null && eachMeta[1] != "") {
                    let keyValue;
                    let resString;
                    if (typeof eachMeta[1] == 'object') {
                        eachMeta[1].forEach((eachValue: any) => {
                            keyValue = eachMeta[0] + ': ' + eachValue;
                            resString = 'YAML: ' + keyValue;
                            blYAMLArr.push([eachItem.file.path, resString]);
                        });
                    } else {
                        keyValue = eachMeta[0] + ': ' + eachMeta[1];
                        resString = 'YAML: ' + keyValue;
                        blYAMLArr.push([eachItem.file.path, resString]);
                    }
                }
            });
        }

        blLinksArr.push([eachItem.file.path, thisFile.basename]);
    });

    thisPlugin.origFilterArr = blLinksArr.concat(blTagsArr).concat(blYAMLArr);
    if (thisPlugin.origFilterArrAll.length == 0) { thisPlugin.origFilterArrAll = thisPlugin.origFilterArr; }
    thisPlugin.headingsArr = blHeadingsArr;

    let linkSuggArr: Array<any> = [];
    let linkSuggCtrArr: Array<any> = [];
    let linkSuggPgArr: Array<any> = [];
    //console.log('Getting list to filter');
    blLinksArr.forEach(eachItem => {
        if (!linkSuggArr.includes(eachItem[1])) {
            linkSuggArr.push(eachItem[1]);
            linkSuggPgArr.push(eachItem[0] + eachItem[1]);
            linkSuggCtrArr.push([eachItem[1], 1, 1]);
        } else {
            let foundIndex = linkSuggCtrArr.findIndex(eachLinkItem => eachLinkItem[0] == eachItem[1]);
            let oldValue = linkSuggCtrArr[foundIndex][2];
            linkSuggCtrArr[foundIndex][2] = oldValue + 1;

            if (!linkSuggPgArr.includes(eachItem[0] + eachItem[1])) {
                linkSuggPgArr.push(eachItem[0] + eachItem[1]);
                oldValue = linkSuggCtrArr[foundIndex][1];
                linkSuggCtrArr[foundIndex][1] = oldValue + 1;
            }
        }
    });

    let tagSuggArr: Array<any> = [];
    let tagSuggCtrArr: Array<any> = [];
    let tagSuggPgArr: Array<any> = [];
    blTagsArr.forEach(eachItem => {
        if (!tagSuggArr.includes(eachItem[1])) {
            tagSuggArr.push(eachItem[1]);
            tagSuggPgArr.push(eachItem[0] + eachItem[1]);
            tagSuggCtrArr.push([eachItem[1], 1, 1]);
        } else {
            let foundIndex = tagSuggCtrArr.findIndex(eachTagItem => eachTagItem[0] == eachItem[1]);
            let oldValue = tagSuggCtrArr[foundIndex][2];
            tagSuggCtrArr[foundIndex][2] = oldValue + 1;

            if (!tagSuggPgArr.includes(eachItem[0] + eachItem[1])) {
                tagSuggPgArr.push(eachItem[0] + eachItem[1]);
                oldValue = tagSuggCtrArr[foundIndex][1];
                tagSuggCtrArr[foundIndex][1] = oldValue + 1;
            }
        }
    });

    let yamlSuggArr: Array<any> = [];
    let yamlSuggCtrArr: Array<any> = [];
    let yamlSuggPgArr: Array<any> = [];
    blYAMLArr.forEach(eachItem => {
        if (!yamlSuggArr.includes(eachItem[1])) {
            yamlSuggArr.push(eachItem[1]);
            yamlSuggPgArr.push(eachItem[0] + eachItem[1]);
            yamlSuggCtrArr.push([eachItem[1], 1, 1]);
        } else {
            let foundIndex = yamlSuggCtrArr.findIndex(eachYamlItem => eachYamlItem[0] == eachItem[1]);
            let oldValue = yamlSuggCtrArr[foundIndex][2];
            yamlSuggCtrArr[foundIndex][2] = oldValue + 1;

            if (!yamlSuggPgArr.includes(eachItem[0] + eachItem[1])) {
                yamlSuggPgArr.push(eachItem[0] + eachItem[1]);
                oldValue = yamlSuggCtrArr[foundIndex][1];
                yamlSuggCtrArr[foundIndex][1] = oldValue + 1;
            }
        }
    });

    let newLinkSuggArr: Array<any> = [];

    //Add filter value placeholder for Plain Text keyword search
    newLinkSuggArr.push('*Custom Keyword Search*');

    let itemsRemaining = tagSuggCtrArr.filter(eachItem => !thisPlugin.selectedFiltArr.includes(eachItem[0]));

    itemsRemaining.sort(function (a, b) { return b[2] - a[2] });
    itemsRemaining.sort(function (a, b) { return b[1] - a[1] });
    itemsRemaining.forEach(eachItem => {
        let itemWithCount = eachItem[0] + ' (' + eachItem[1] + '|' + eachItem[2] + ')';
        if (!newLinkSuggArr.includes(itemWithCount)) { newLinkSuggArr.push(itemWithCount); }
    });

    itemsRemaining = linkSuggCtrArr.filter(eachItem => !thisPlugin.selectedFiltArr.includes(eachItem[0]));

    itemsRemaining.sort(function (a, b) { return b[2] - a[2] });
    itemsRemaining.sort(function (a, b) { return b[1] - a[1] });
    itemsRemaining.forEach(eachItem => {
        let itemWithCount = eachItem[0] + ' (' + eachItem[1] + '|' + eachItem[2] + ')';
        if (!newLinkSuggArr.includes(itemWithCount)) { newLinkSuggArr.push(itemWithCount); }
    });

    itemsRemaining = yamlSuggCtrArr.filter(eachItem => !thisPlugin.selectedFiltArr.includes(eachItem[0]));

    itemsRemaining.sort(function (a, b) { return b[2] - a[2] });
    itemsRemaining.sort(function (a, b) { return b[1] - a[1] });
    itemsRemaining.forEach(eachItem => {
        let itemWithCount = eachItem[0] + ' (' + eachItem[1] + '|' + eachItem[2] + ')';
        if (!newLinkSuggArr.includes(itemWithCount)) { newLinkSuggArr.push(itemWithCount); }
    });

    thisPlugin.filterArr = linkSuggCtrArr.concat(tagSuggCtrArr).concat(yamlSuggCtrArr);
    thisPlugin.openModal = new ModalSelectBlFilter(thisApp, newLinkSuggArr, thisPlugin);
    thisPlugin.openModal.open();
}
