const TRANSLATIONS = { 
    // From https://szentiras.eu/forditasok
    "SZIT": {name: "Szent István Társulati Biblia", type: 'catholic'},
    "KNB": {name: "Káldi György Neovulgátája", type: 'newtestament'},
    "STL": {name: "Simon Tamás László Újszövetség-fordítása", type: 'newtestament'},
    "BD": {name: "Békés-Dalos Újszövetség", type: 'newtestament'},
    "RUF": {name: "Magyar Bibliatársulat újfordítású Bibliája (2014)", type: 'protestant'},
    "KG": {name: "Károli Gáspár Újfordítása 1908-ból", type: 'protestant'},
}

var TRANSLATIONMISSING = {
    // Which books are missing from which translations
    "catholic": [], // Full Bible
    "newtestament": ['GEN-MAL'], // New Testament only
    "protestant": ['TOB', 'JDT', '1MA', '2MA', 'WIS', 'SIR', 'BAR'], // Protestant Bible
}

var BIBLE = [ 
    // Will be pulled from bible_booklengths.json
    // USX codes from https://github.com/ubsicap/usx/blob/master/schema/usx_2.6.rnc 
    // Other data (chapter and verse counts, alternative names  for books) from https://halld.ujevangelizacio.hu/biblemap.html
    //  ($.xmlToJSON(bibleMap.dataXML))
]

const POINTLOGIC = {
    // Logic of awarding points based on number of revealed words and guesses
    base: 12, // Base points for a correct guess
    perUnrevealedWord: 1, // Points per unrevealed word
    perRevealedWord: 0, // Points deducted per revealed word
    testamentBonus: 2, // Bonus points for the player who guessed the correct testament (OT/NT) (first if multiplayer)
    bookBonus: 5, // Bonus points for the player who guessed the correct book (first if multiplayer)
    chapterBonus: 9, // Bonus points for the player who guessed the correct chapter (first if multiplayer)
}

function loadPointLogicFromURL() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('pointcalc')) {
        const vals = params.get('pointcalc').split(',').map(Number);
        const keys = Object.keys(POINTLOGIC);
        for (let i = 0; i < vals.length && i < keys.length; i++) {
            if (!isNaN(vals[i])) POINTLOGIC[keys[i]] = vals[i];
        }
        if (DEBUGMODE) console.log("Loaded POINTLOGIC from URL:", POINTLOGIC);
    }
}

var DEFAULTTRANS = new URLSearchParams(window.location.search).get('version') || "RUF";
var VERSETEXT = "";
var VERSELOC = [0, 1, 1]; // [booknum, chapter, verse]
const NUMOFPLAYERS = parseInt(new URLSearchParams(window.location.search).get('players')) || 1;
const AUTOREVEAL = (['false', '0', 'no'].includes(new URLSearchParams(window.location.search).get('autoreveal'))) ? false : true;
const HEADINGS = (['true', '1', 'yes'].includes(new URLSearchParams(window.location.search).get('headings'))) ? true : false;
var STATS = {
    rounds: 0,
    totalguesses: 0,
    totalpoints: 0,
    minGuesses: null,
    maxunrevealed: null,
};
var GAMESTATE = {
    playedrounds: -1,
    starterplayer: 0,
    currentPlayer: 0,
    revealedWords: new Set(),
    allwords: 0,
    guessed: false,
}
var GUESSES = [];
const DEBUGMODE = (['true', '1', 'yes'].includes(new URLSearchParams(window.location.search).get('debug'))) ? true : false;
if (DEBUGMODE) console.log("DEBUG MODE ON");

/**
 * Applies dark mode styling to the page if the user prefers dark color scheme or if forced.
 * 
 * @function applyDarkModeIfPreferred
 * @param {boolean} [force=false] - If true, force dark mode on; if false, use system preference
 * @returns {void}
 */
function applyDarkModeIfPreferred(force=false) {
    // Detect if user prefers dark color scheme
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches || force === true) {
        // Find the stylesheet for vetelkedooldal.css
        let darkVars = {
            '--primary-color': '#66a0dbff',
            '--hover-primary-color': '#4f7cb4ff',
            '--secondary-color': '#197fc3ff',
            '--hover-secondary-color': '#0f6eaeff',
            '--success-color': '#35b76cff',
            '--hover-success-color': '#229954',
            '--background-color': '#181a1b',
            '--input-color': '#23272a',
            '--section-color': '#23272a',
            '--foreground-color': '#222932ff',
            '--text-color': '#f8f8f8',
            '--muted-text-color': '#b0b0b0',
            '--border-color': '#333a41',
            '--shadow': 'rgba(0,0,0,0.5)'
        };
        // Apply to :root
        let root = document.documentElement;
        for (let key in darkVars) {
            root.style.setProperty(key, darkVars[key]);
        }
    }
}
let DarkMode = new URLSearchParams(window.location.search).get('darkmode')
if (['true', '1', 'yes'].includes(DarkMode)) DarkMode =  ['true', '1', 'yes'].includes(DarkMode)
if (['false', '0', 'no'].includes(DarkMode)) DarkMode =  !['false', '0', 'no'].includes(DarkMode)
console.log("Dark mode preference:", DarkMode);
if (DarkMode !== false) applyDarkModeIfPreferred(DarkMode);

/**
 * Loads Bible book data from JSON file and populates the BIBLE array.
 * 
 * @function reconstruct_bible_dict
 * @returns {void}
 */
function reconstruct_bible_dict() {    
    req = new XMLHttpRequest();
    req.open("GET", "bible_booklengths.json", false);
    req.send(null);
    BIBLE = JSON.parse(req.responseText);
    if (DEBUGMODE) console.log("Loaded Bible data:", BIBLE);
}

/**
 * Gets the appropriate API URL for a Bible verse from szentiras.eu API.
 * 
 * @function verse_url
 * @param {number} [bnum=0] - Book number (0-based index in BIBLE array)
 * @param {number} [chapter=1] - Chapter number
 * @param {number} [verse=1] - Verse number
 * @param {string} [translation="SZIT"] - Translation code (e.g., "SZIT"), or "all" for all translations
 * @returns {string} URL to fetch the verse data
 */
function verse_url(bnum=0, chapter=1, verse=1, translation="SZIT") {
    let location = ''
    if (translation === 'all') {
        location = `${BIBLE[bnum].code}_${chapter.toString()}_${verse.toString()}`;
    } else {
        location = `${get_abbr(bnum)}%20${chapter.toString()},${verse.toString()}`;
    }
    let url = `https://szentiras.eu/api/${translation === "all" ? "forditasok" : "ref"}/${location}`
    url += (translation === "all" ? "" : `/${translation}`);

    return url;
}

/**
 * Gets the book number for a given book entry (Book name and default abbrev in parentheses (as in dropdown options), USX code or abbreviation).
 * 
 * @function getbooknumforentry
 * @param {string} entry - USX book name, code or abbreviation (e.g., "Jn", "Ján", "Szent János evangéliuma" or "Szent János Evangéliuma (Jn)")
 * @param {boolean} [forcefulltext=false] - Whether to force full text matching
 * @returns {number} Book number (0-based index in BIBLE), or -1 if not found
 */
function getbooknumforentry(entry, forcefulltext=false) {
    let booknum = BIBLE.indexOf(BIBLE.find(b => `${b.name} (${get_abbr(BIBLE.indexOf(b))})` === entry));
    if (booknum === -1) {
        booknum = BIBLE.indexOf(BIBLE.find(b => get_alt_name(b.name) + ` (${get_abbr(BIBLE.indexOf(b))})` === entry));
        if (booknum === -1 && !forcefulltext) {
            booknum = BIBLE.indexOf(BIBLE.find(b => b.code === entry));
            if (booknum === -1) {
                booknum = BIBLE.indexOf(BIBLE.find(b => b.abbrevs && b.abbrevs.includes(entry)));
                if (booknum === -1) {
                    booknum = BIBLE.indexOf(BIBLE.find(b => b.name === entry));
                    if (booknum === -1) {
                        booknum = BIBLE.indexOf(BIBLE.find(b => b.sortName === entry));
                    }
                }
            }
        }
    }
    if (DEBUGMODE) console.log("Book number for entry", entry, "is:", booknum, booknum === -1 ? "NOT FOUND" : BIBLE[booknum].name);
    return booknum;
}

/**
 * Trims trailing and leading whitespace, and replaces multiple spaces with single space.
 * 
 * @function trimtext
 * @param {string} txt - The text to trim
 * @returns {string} The trimmed text
 */
function trimtext(txt) {
    return txt.replace(/\s+/g, ' ').trim();
}

/**
 * Loads a Bible verse from szentiras.eu API.
 * 
 * @function load_verse
 * @param {(string|number)} [book="Jn"] - USX book code, abbreviation, or book number (0-based index)
 * @param {number} [chapter=3] - Chapter number
 * @param {number} [verse=16] - Verse number
 * @param {string} [translation="SZIT"] - Translation code (e.g., "SZIT"), or "all" for all translations
 * @returns {(string|Object|null)} The verse text, object of translations if "all" was requested, or null if not found
 */
function load_verse(book="Jn", chapter=3, verse=16, translation="SZIT", forcefetching=false) {
    // Validate inputs
    let booknum = 0;
    if (typeof book === 'number') {
        booknum = book;
        book = BIBLE[book].code;
    } else {
        booknum = getbooknumforentry(book, false);
    }
    if (booknum === -1) return null;
    if (chapter < 1 || chapter > BIBLE[booknum].chapters.length) return null;
    if (verse < 1 || verse > BIBLE[booknum].chapters[chapter - 1]) return null;

    // Fetch verse data
    let url = (DEBUGMODE && !forcefetching) ? 'plreq.json' : verse_url(booknum, chapter, verse, translation);
    let req = new XMLHttpRequest();
    req.open("GET", url, false);
    req.send(null);
    if (req.status === 200) {
        let response = JSON.parse(req.responseText);
        let text = "";
        if (translation === "all") {
            let texts = {};
            for (let t in response.valasz.versek) {
                text = response.valasz.versek[t].szoveg.trim().replace('  ', '\n'); // Replace double spaces with newlines;
                let transCode = response.valasz.versek[t].forditas.szov;
                texts[t] = {text: text, translation: transCode};
            }
            return texts;
        } else {
            text = response['text'];
            if (DEBUGMODE) console.log(`Verse (${response['canonicalUrl']}) loaded, raw text: "${text}"`);
            titlesintext = text.match(/^ +?[A-ZÖÜÓŐÚŰÁÉÍ0-9].*?  ( +?[A-ZÖÜÓŐÚŰÁÉÍ0-9].*?  )*/gm);
            if (titlesintext) {
                titlesintext = titlesintext[0].split('   ')
                for (let titleidx = 0; titleidx < titlesintext.length; titleidx++) {
                    // Wrap all titles in {{}} and add a newline after or delete it if headings are disabled
                    if (HEADINGS) {
                        text = text.replace(titlesintext[titleidx], `{{${titlesintext[titleidx].trim()}}}\n`); 
                    } else {
                        text = text.replace(titlesintext[titleidx], '');
                    }
                }
            }
            return text.trim();
        }
    } else {
        console.log(`Error fetching verse (${url}): ${req.status}`);
        return null;
    }
}

/**
 * Checks if a given translation contains the specified book.
 * 
 * @function check_translation_availability
 * @param {number} [booknum=0] - Book number (0-based index in BIBLE array)
 * @param {string} [translation="SZIT"] - Translation code (e.g., "SZIT") or translation type (e.g., "catholic")
 * @returns {boolean} True if the translation contains the book, false otherwise
 */
function check_translation_availability(booknum=0, translation="SZIT") {
    let transType = (TRANSLATIONMISSING.hasOwnProperty(translation)) ? translation : TRANSLATIONS[translation].type; 
    for (let missingBook of TRANSLATIONMISSING[transType]) {
        if (missingBook.includes('-')) {
            // Range of books
            let rangeParts = missingBook.split('-');
            let startBookNum = getbooknumforentry(rangeParts[0]);
            let endBookNum = getbooknumforentry(rangeParts[1]);
            if (booknum >= startBookNum && booknum <= endBookNum) {
                return false;
            }
        } else {
            // Single book code
            if (missingBook === BIBLE[booknum].code) {
                return false;
            }
        }
    }
    return true;
}

/**
 * Gets a random Bible verse location from the current translation.
 * 
 * @function random_verse
 * @returns {number[]} Array with [booknum, chapter, verse]
 */
function random_verse() {
    let booknum = Math.floor(Math.random() * BIBLE.length);
    while (!check_translation_availability(booknum, DEFAULTTRANS)) {
        booknum = Math.floor(Math.random() * BIBLE.length);
    }
    let chapter = Math.floor(Math.random() * BIBLE[booknum].chapters.length) + 1;
    let verse = Math.floor(Math.random() * BIBLE[booknum].chapters[chapter - 1]) + 1;
    return [booknum, chapter, verse];
}

/**
 * Adds a dropdown menu with selectable options below an input element.
 * 
 * @function add_dropdown_for_input
 * @param {HTMLElement|null} [inputElement=null] - Input element to attach dropdown to
 * @param {string[]} [options=[]] - Array of option strings to display
 * @param {Function} [focusoutfunc=() => {}] - Callback function to execute on focus out
 * @param {number} [eventstamp=0] - Event timestamp for tracking
 * @returns {void}
 */
function add_dropdown_for_input(inputElement=null, options=[], focusoutfunc=() => {}) {
    if (!inputElement) return;
    if (inputElement.nextSibling && inputElement.nextSibling.className === 'dropdown-options') {
        inputElement.nextSibling.remove();
    }    
    if (options.length === 0) return;
        let container = document.createElement('div');
        container.className = 'dropdown-options';
        
        options.forEach(option => {
            let optionDiv = document.createElement('div');
            optionDiv.className = 'dropdown-option';
            optionDiv.textContent = option;
            optionDiv.addEventListener('mousedown', () => {
                inputElement.value = option.toString();
                container.style.display = 'none';
            });
            container.appendChild(optionDiv);
        });
        
        inputElement.parentNode.insertBefore(container, inputElement.nextSibling);

        inputElement.addEventListener('focusout', () => {
            setTimeout(() => {
                container.style.display = 'none';
                focusoutfunc();
            }, 10);
        });
}

/** Gets the appropriate abbreviation for a book based on the translation type (catholic/protestant).
 * 
 * @function get_abbr
 * @param {(string|number)} book - Book name, code, abbreviation, or book number (0-based index)
 * @param {string} [translation=DEFAULTTRANS] - Translation code (e.g., "SZIT")
 * @returns {string|null} Abbreviation of the book, or null if not found
 **/
function get_abbr(book, translation=DEFAULTTRANS) {
    let booknum = typeof(book) === "number" ? book : getbooknumforentry(book);
    if (booknum === -1) return null;
    let abbr = "";
    if (TRANSLATIONS.hasOwnProperty(translation)) {
        let transType = TRANSLATIONS[translation].type;
        if (transType === 'protestant') {
            // Protestant Bible: use first abbrev if available
            abbr = BIBLE[booknum].abbrevs ? BIBLE[booknum].abbrevs[0] : BIBLE[booknum].sortName;
        } else if (transType === 'catholic' || transType === 'newtestament') {
            // Catholic Bible: use default sortName
            abbr = BIBLE[booknum].sortName;
        }
    }
    return abbr;
}

/**
 * Gets the alternative name of a book stored in parentheses, if available.
 * 
 * @function get_alt_name
 * @param {string} bookname - The original book name
 * @returns {string} The alternative name if available, otherwise the original name
 */
function get_alt_name(bookname) {
    // Returns the alternative name stored in parentheses of a book if available, otherwise returns the original name
    if (!bookname.includes('(')) return bookname;
    let returnname = bookname.match(/\((.+)\)/)[1];
    if (bookname.includes('könyve') && !returnname.includes('könyve')) {
        returnname += ' könyve';
    }
    return returnname;
}

/**
 * Refreshes the book dropdown suggestions based on current input value.
 * 
 * @function refreshbookdropdown
 * @param {HTMLElement} [bookinput=document.getElementById("bookInput")] - Book input element
 * @returns {void}
 */
function refreshbookdropdown(bookinput=document.getElementById("bookInput")) {
    let filteredBible = BIBLE.filter(b => check_translation_availability(BIBLE.indexOf(b), DEFAULTTRANS));
    let bookIdentifs = filteredBible.map(b => [b.code].concat(b.abbrevs).concat([b.name]));
    let bookOptions = filteredBible.map(b => {
        let bookname = b.name;
        if (get_abbr(BIBLE.indexOf(b)) !== b.sortName) {
            bookname = get_alt_name(bookname);
        }
        return bookname + ` (${get_abbr(BIBLE.indexOf(b))})`;
    });
    let optionRanks = new Array(bookOptions.length).fill(0);
    let inputVal = bookinput.value.trim().toUpperCase();
    for (let book = 0; book < bookIdentifs.length; book++) {
        let contains = 0;
        let startswith = 0;
        let exactmatch = 0;
        for (let identif of bookIdentifs[book]) {
            identif = identif.trim().toUpperCase();
            if (identif.includes(inputVal) && contains === 0) {
                contains = 1;
            }
            if (identif.startsWith(inputVal) && startswith === 0) {
                startswith = 1;
            }
            if (identif === inputVal && exactmatch === 0) {
                exactmatch = 1;
            }
        }
        optionRanks[book] = contains + startswith + exactmatch;
    }
    bookOptions = bookOptions.sort((a, b) => optionRanks[bookOptions.indexOf(b)] - optionRanks[bookOptions.indexOf(a)]);
    optionRanks = optionRanks.sort((a, b) => b - a);
    if (DEBUGMODE) console.log("Book options ranked:", bookOptions, optionRanks);
    add_dropdown_for_input(bookinput, bookOptions.slice(0, optionRanks.indexOf(0)), () => {
        if (getbooknumforentry(bookinput.value, true) === -1 && bookinput.value.length > 0) {
            if (bookinput.nextSibling.className === 'dropdown-options' && bookinput.nextSibling.firstChild !== null) {
                bookinput.value = bookinput.nextSibling.firstChild.textContent;
            } else {
                if (DEBUGMODE) console.log(bookinput.value, "is not a valid book entry, clearing input");
                bookinput.value = '';
            }
        }
    });
}

/**
 * Refreshes chapter or verse dropdown suggestions based on book and chapter selections.
 * 
 * @function refreshchapterorversedropdown
 * @param {string} [numberinpid='chapterInput'] - ID of the input element for chapter/verse
 * @param {string} [bookinputid='bookInput'] - ID of the book input element
 * @param {boolean} [versemode=false] - If true, generates verse numbers; if false, generates chapter numbers
 * @param {string} [chapterid='chapterInput'] - ID of the chapter input element (used in verse mode)
 * @returns {void}
 */
function refreshchapterorversedropdown(numberinpid='chapterInput', bookinputid='bookInput', versemode=false, chapterid='chapterInput') {
    let numberOptions = [];
    let booknum = getbooknumforentry(document.getElementById(bookinputid).value);
    if (booknum === -1) return;
    let maxNumber = BIBLE[booknum].chapters.length;
    let forchapter = 0
    if (versemode) {
        forchapter = parseInt(document.getElementById(chapterid).value) || 1;
        maxNumber = BIBLE[booknum].chapters[forchapter - 1];
    }
    for (let ch = 1; ch <= maxNumber; ch++) {
        numberOptions.push(ch.toString());
    }
    let numberinput = document.getElementById(numberinpid);
    numberinput.removeEventListener('focusout', () => {});
    add_dropdown_for_input(numberinput, numberOptions, () => {
        booknum = getbooknumforentry(document.getElementById(bookinputid).value);
        if (versemode) {
            forchapter = parseInt(document.getElementById(chapterid).value) || 1;
            maxNumber = BIBLE[booknum].chapters[forchapter - 1];
        } else {
            maxNumber = BIBLE[booknum].chapters.length;
        }
        numberinput.value = Math.min(Math.max(parseInt(numberinput.value) || 1, 1), maxNumber).toString();
    });
}

/**
 * Displays a bonus badge emoji next to a guess in the guesses list.
 * 
 * @function award_guess
 * @param {number} guessnum - Index of the guess to award
 * @param {string} type - Badge emoji to display (e.g., '✝️', '📖', '📄')
 * @returns {void}
 */
function award_guess(guessnum, type) {
    try {
        document.querySelector(`#guessesList span:nth-child(${guessnum + 1}) .guess-medals`).textContent += `  ${type}🏆`;
    } catch (e) {
        if (DEBUGMODE) console.error("Error updating testament bonus display:", e);
    }
}

/**
 * Calculate and award points to players based on the guesses and revealed words
 * 
 * - if single player mode:
 *   - the only player gets base points + per unrevealed word points - per revealed word points
 *   - checks guesses for testament, book, chapter bonuses and display badges next to the guess
 *   - all bonuses are awarded to the single player
 * - if multiplayer mode:
 *   - the current player gets base points + per unrevealed word points - per revealed word points
 *   - checks guesses in order (starting from the starting player) for testament, book, chapter bonuses and display badges next to the guess
 *   - only the first player to guess each bonus correctly gets the bonus
 * - ensures no player's total points go below zero
 * @function pointsforplayers
 * @returns {void}
 */
function pointsforplayers() {
    let points = POINTLOGIC.base;
    points += POINTLOGIC.perUnrevealedWord * (GAMESTATE.allwords - GAMESTATE.revealedWords.size);
    points += POINTLOGIC.perRevealedWord * GAMESTATE.revealedWords.size;
    if (NUMOFPLAYERS === 1) {
        // Single player mode: add all bonuses
        let bonusesGiven = {testament: false, book: false, chapter: false};
        for (let r=0; r < GUESSES.length; r++) {
            if (!bonusesGiven.testament) {
                let guessNTbook = check_translation_availability(GUESSES[r][0], 'newtestament');
                let solNTbook = check_translation_availability(VERSELOC[0], 'newtestament');
                if (guessNTbook === solNTbook) {
                    points += POINTLOGIC.testamentBonus;
                    award_guess(r, '✝️');
                    bonusesGiven.testament = true;
                }
            }
            if (!bonusesGiven.book) {
                if (GUESSES[r][0] === VERSELOC[0]) {
                    points += POINTLOGIC.bookBonus;
                    award_guess(r, '📖');
                    bonusesGiven.book = true;
                }
            }
            if (!bonusesGiven.chapter) {
                if (GUESSES[r][0] === VERSELOC[0] && GUESSES[r][1] === VERSELOC[1]) {
                    points += POINTLOGIC.chapterBonus;
                    award_guess(r, '📄');
                    bonusesGiven.chapter = true;
                }
            }
        }
        STATS.totalpoints += points;
    } else {
        // Multiplayer mode
        STATS[`player${GAMESTATE.currentPlayer + 1}`].totalpoints += points;
        // cycle through guesses in order and award bonuses
        let bonusesGiven = {testament: false, book: false, chapter: false};
        let maxrounds = Math.max(...GUESSES.map(g => g.length));
        if (DEBUGMODE) console.log("Calculating points for players, max rounds:", maxrounds, GUESSES);
        if (DEBUGMODE) console.log("Started round: player", GAMESTATE.starterplayer + 1);
        let p = 0;
        let skipped = 0;
        for (let r = 0; r < maxrounds; r++) {
            for (let p0 = 0; p0 < NUMOFPLAYERS; p0++) {
                p = (GAMESTATE.starterplayer + p0) % NUMOFPLAYERS;
                if (DEBUGMODE) console.log(`Checking player ${p + 1} round ${r + 1} guess:`, GUESSES[p][r]);
                if (GUESSES[p][r]) {
                    if (!bonusesGiven.testament) {
                        let guessNTbook = check_translation_availability(GUESSES[p][r][0], 'newtestament');
                        let solNTbook = check_translation_availability(VERSELOC[0], 'newtestament');
                        if (guessNTbook === solNTbook) {
                            STATS[`player${p + 1}`].totalpoints += POINTLOGIC.testamentBonus;
                            award_guess(r * NUMOFPLAYERS + p0, '✝️');
                            bonusesGiven.testament = true;
                        }
                    }
                    if (!bonusesGiven.book) {
                        if (GUESSES[p][r][0] === VERSELOC[0]) {
                            STATS[`player${p + 1}`].totalpoints += POINTLOGIC.bookBonus;
                            award_guess(r * NUMOFPLAYERS + p0, '📖');
                            bonusesGiven.book = true;
                        }
                    }
                    if (!bonusesGiven.chapter) {
                        if (GUESSES[p][r][0] === VERSELOC[0] && GUESSES[p][r][1] === VERSELOC[1]) {
                            STATS[`player${p + 1}`].totalpoints += POINTLOGIC.chapterBonus;
                            award_guess(r * NUMOFPLAYERS + p0, '📄');
                            bonusesGiven.chapter = true;
                        }
                    }
                } else {
                    skipped++;
                }
            }
        }
        for (let p = 0; p < NUMOFPLAYERS; p++) {
            if (STATS[`player${p + 1}`].totalpoints < 0) {
                STATS[`player${p + 1}`].totalpoints = 0;
            }
        }
    }
}

/**
 * Displays an alert popup with a message and optional title and buttons.
 *
 * @param {string} message - The message to display in the popup
 * @param {string} [title="Figyelem!"] - The title of the popup
 * @param {string} [okbuttontext="Rendben"] - Text for the OK button
 * @param {string|null} [nobuttontext=null] - Text for the Cancel button (if null, no Cancel button is shown)
 * @param {Function|null} [okfunc=null] - Callback function to execute when OK button is clicked
 * @returns {void}
 */

function alertPopup(message, title="Figyelem!", okbuttontext="Rendben", nobuttontext=null, okfunc=null) {
    const existingPopup = document.getElementById('alertPopup');
    if (existingPopup) existingPopup.remove();

    const popupOverlay = document.createElement('div');
    popupOverlay.id = 'alertPopup';
    popupOverlay.className = 'overlay';

    const popupBox = document.createElement('div');
    popupBox.textContent = title;
    popupBox.className = 'box';

    const messageText = document.createElement('p');
    messageText.textContent = message;
    popupBox.appendChild(messageText);

    const closeButton = document.createElement('button');
    closeButton.textContent = okbuttontext;
    if (nobuttontext) {
        closeButton.className = 'btn-success okbutton';
    } else {
        closeButton.className = 'btn-primary okbutton';
    }
    closeButton.addEventListener('click', () => {
        if (okfunc) okfunc();
        popupOverlay.remove();
    });
    popupBox.appendChild(closeButton);

    if (nobuttontext) {
        const noButton = document.createElement('button');
        noButton.textContent = nobuttontext;
        noButton.className = 'btn-secondary nobutton';
        noButton.addEventListener('click', () => {
            popupOverlay.remove();
        });
        popupBox.appendChild(noButton);
    }

    popupOverlay.appendChild(popupBox);
    popupOverlay.addEventListener('click', (e) => {
        if (e.target === popupOverlay) popupOverlay.remove();
    });

    document.body.appendChild(popupOverlay);
}

/**
 * Handles the guessing logic for the Bible verse guessing game.
 * 
 * Validates the guess, displays result indicators, records the guess, updates statistics,
 * and advances to the next player in multiplayer mode or reveals words in autoreveal mode.
 * 
 * @function checkGuess
 * @returns {void}
 */
function checkGuess(specialevent=null) {
    let bookinput = document.getElementById("bookInput");
    let chapterinput = document.getElementById("chapterInput");
    let verseinput = document.getElementById("verseInput");
    let guessedloc = undefined;

    if (specialevent === 'skip') {
        // Skip turn in multiplayer mode
        if (NUMOFPLAYERS > 1) {
            alertPopup(`Játékos ${(GAMESTATE.currentPlayer + 1) % NUMOFPLAYERS + 1} következik!`, "Következő játékos", "Rendben");
        }
    } else {
        guessedloc = [
            getbooknumforentry(bookinput.value),
            parseInt(chapterinput.value) || 1,
            parseInt(verseinput.value) || 1
        ];
        // Validate guessed location
        alerttext = "";
        if (guessedloc[0] === -1) {
            alerttext = "Érvénytelen könyv!";
        } else {
            if (guessedloc[1] < 1 || guessedloc[1] > BIBLE[guessedloc[0]].chapters.length) {
                alerttext += " Érvénytelen fejezet!";
            }
            if (guessedloc[2] < 1 || guessedloc[2] > BIBLE[guessedloc[0]].chapters[guessedloc[1] - 1]) {
                alerttext += " Érvénytelen vers!";
            }
        }
        if (alerttext.length > 0) {
            alertPopup(alerttext.trim(), "Hibás tippelés :(", "Értettem.");
            return;
        }
    }

    // Create display text for guessed location
    let guessedBookName = '';
    let guessText = '';
    if (specialevent === 'skip') {
        guessText = ' Kihagyta a körét';
    } else {
        guessedBookName = get_abbr(guessedloc[0]);
        guessText = `${guessedBookName} ${guessedloc[1]},${guessedloc[2]}`;
    }
    
    // Create span element
    let guessSpan = document.createElement('span');
    guessSpan.textContent = guessText;
    let lookupSpan, medalsSpan, resultSpan, playerNote;
    if (specialevent !== 'skip') {
        //      Add verse text lookup as tooltip
        lookupSpan = document.createElement('abbr');
        lookupSpan.textContent = ' 🔍';
        guessSpan.appendChild(lookupSpan);
        let guessedVerseText = load_verse(guessedloc[0], guessedloc[1], guessedloc[2], DEFAULTTRANS, true);
        lookupSpan.className = 'verse-lookup' + (!guessedVerseText ? ' not-found' : '');
        lookupSpan.title = guessedVerseText ? `„${guessedVerseText.replace('\n', ' ')}”` : "Nem található versszöveg.";
        lookupSpan.addEventListener('click', (e) => {
            e.stopPropagation();
            if (guessedVerseText) alertPopup(guessedVerseText, `Vers szövege (${guessText}):`, "Bezár");
        });
        //      Add medals span
        medalsSpan = document.createElement('abbr');
        medalsSpan.className = 'guess-medals';
        guessSpan.appendChild(medalsSpan);
        //      Add clue symbol and tooltip
        resultSpan = document.createElement('abbr');
        resultSpan.className = 'guess-result';
        guessSpan.appendChild(resultSpan);
    }

    
    if (NUMOFPLAYERS > 1) {
        playerNote = document.createElement('strong');
        playerNote.textContent = `Játékos ${GAMESTATE.currentPlayer + 1}:`;
        guessSpan.prepend(playerNote);
    }
    
    // Record the guess
    if (NUMOFPLAYERS > 1) {
        GUESSES[GAMESTATE.currentPlayer].push(guessedloc);
        if (DEBUGMODE) console.log(`player${GAMESTATE.currentPlayer}`, STATS);
        STATS[`player${GAMESTATE.currentPlayer + 1}`].totalguesses += 1;
    } else {
        GUESSES.push(guessedloc);
        STATS.totalguesses += 1;
    }

    // Add to guess Node list and remove idle elements
    const guessesList = document.querySelector('.guesses-list');
    document.querySelectorAll('.guesses-list .idle').forEach(el => el.remove());
    guessesList.appendChild(guessSpan);
    
    if (specialevent !== 'skip') {
        // Evaluate guess and add emoji
        if (guessedloc[0] === VERSELOC[0] && guessedloc[1] === VERSELOC[1] && guessedloc[2] === VERSELOC[2]) {
            GAMESTATE.guessed = true;
            
            resultSpan.textContent = '🎉';
            // The black doesn't look good on success color background
            guessSpan.style.color = '#f2f2f2';
            guessSpan.style.backgroundColor = 'var(--success-color)';
            if (NUMOFPLAYERS > 1) {
                // The primary color don't contrast well with the success color background
                playerNote.style.color = 'white';
            }
            resultSpan.title = "Helyes találat!";
            console.log("Correct guess:", guessedloc);

            // Disable inputs
            bookinput.disabled = true;
            chapterinput.disabled = true;
            verseinput.disabled = true;
            document.getElementById('guessButton').setAttribute('disabled', '');

            // Update statistics
            if (NUMOFPLAYERS === 1) {
                STATS.rounds += 1;
            } else {
                STATS[`player${GAMESTATE.currentPlayer + 1}`].wonrounds += 1;
            }

            // Evaluate min guesses/revealed stats
            if (NUMOFPLAYERS === 1) {
                if (STATS.maxunrevealed === null || GAMESTATE.allwords - GAMESTATE.revealedWords.size > STATS.maxunrevealed) {
                    STATS.maxunrevealed = GAMESTATE.allwords - GAMESTATE.revealedWords.size;
                }
                if (STATS.minGuesses === null || GUESSES.length < STATS.minGuesses) {
                    STATS.minGuesses = GUESSES.length;
                }
            } else {
                if (DEBUGMODE) console.log("Player", GAMESTATE.currentPlayer + 1, "guesses:", GUESSES[GAMESTATE.currentPlayer].length, "current min guesses:", STATS[`player${GAMESTATE.currentPlayer + 1}`].minguesses);
                if (STATS[`player${GAMESTATE.currentPlayer + 1}`].maxunrevealed === null || GAMESTATE.allwords - GAMESTATE.revealedWords.size > STATS[`player${GAMESTATE.currentPlayer + 1}`].maxunrevealed) {
                    STATS[`player${GAMESTATE.currentPlayer + 1}`].maxunrevealed = GAMESTATE.allwords - GAMESTATE.revealedWords.size;
                }
                if (STATS[`player${GAMESTATE.currentPlayer + 1}`].minguesses === null || GUESSES[GAMESTATE.currentPlayer].length < STATS[`player${GAMESTATE.currentPlayer + 1}`].minguesses) {
                    STATS[`player${GAMESTATE.currentPlayer + 1}`].minguesses = GUESSES[GAMESTATE.currentPlayer].length;
                }
            }

            // Calculate points
            pointsforplayers();

            revealWord(document.getElementById('revealButton'));
            update_page();
        } else if (guessedloc[0] < VERSELOC[0] || 
                (guessedloc[0] === VERSELOC[0] && guessedloc[1] < VERSELOC[1]) ||
                (guessedloc[0] === VERSELOC[0] && guessedloc[1] === VERSELOC[1] && guessedloc[2] < VERSELOC[2])) {
            resultSpan.textContent = '➡️';
            resultSpan.title = "A keresett vers később található a Szentírásban.";
            console.log("Guess is earlier:", guessedloc, "Expected:", VERSELOC);
        } else {
            resultSpan.textContent = '⬅️';
            resultSpan.title = "A keresett vers korábban található a Szentírásban.";
            console.log("Guess is later:", guessedloc, "Expected:", VERSELOC);
        }
    }

    if (NUMOFPLAYERS > 1 && !GAMESTATE.guessed) {
        // Advance to next player's turn
        GAMESTATE.currentPlayer = (GAMESTATE.currentPlayer + 1) % NUMOFPLAYERS;
    }
    if (AUTOREVEAL && !GAMESTATE.guessed) {
        // Auto-reveal a word after each guess if autoreveal mode is on
        revealWord(document.getElementById('revealButton'));
    }
    update_stats_display();
}

/**
 * Sets up event listeners for input autocomplete functionality.
 * Should be called once during initialization.
 * 
 * @function setup_input_listeners
 * @returns {void}
 */
function setup_input_listeners() {
    const bookinput = document.getElementById("bookInput");
    const chapterinput = document.getElementById("chapterInput");
    const verseinput = document.getElementById("verseInput");

    bookinput.addEventListener('focus', () => setTimeout(() => refreshbookdropdown(bookinput), 10));
    bookinput.addEventListener('input', () => setTimeout(() => refreshbookdropdown(bookinput), 10));

    chapterinput.addEventListener('focus', () => {
        setTimeout(() => {
            refreshchapterorversedropdown('chapterInput', 'bookInput', false);
        }, 10);
    });

    verseinput.addEventListener('focus', () => {
        setTimeout(() => refreshchapterorversedropdown('verseInput', 'bookInput', true), 10);
    });
}

/**
 * Updates input fields with the current verse location and sets up event listeners for autocomplete suggestions.
 * 
 * Attaches focus and input listeners to book, chapter, and verse fields that generate ranked dropdown suggestions
 * based on matching priority (exact match, starts with, contains).
 * 
 * @function update_inputs
 * @returns {void}
 */
function update_inputs() {
    bookinput = document.getElementById("bookInput");
    chapterinput = document.getElementById("chapterInput");
    verseinput = document.getElementById("verseInput");

    selectedBookNum = getbooknumforentry(bookinput.value);
}

/**
 * Updates the statistics display on the page based on current game state.
 * 
 * In single player mode, displays total rounds, guesses, and points. In multiplayer mode,
 * displays individual player statistics for wins, guesses, and points.
 * In multiplayer mode, also updates the current player display.
 * 
 * @function update_stats_display
 * @returns {void}
 */
function update_stats_display() {
    // Update statistics display
    if (NUMOFPLAYERS === 1) {
        document.getElementById("gamesCount").innerText = GAMESTATE.playedrounds.toString();
        document.getElementById("roundsCount").innerText = STATS.rounds.toString();
        document.getElementById("guessesCount").innerText = STATS.totalguesses.toString();
        document.getElementById("pointsCount").innerText = STATS.totalpoints.toString();
        document.getElementById("minguessCount").innerText = STATS.minGuesses !== null ? STATS.minGuesses.toString() : '-';
        document.getElementById("maxunrevealedCount").innerText = STATS.maxunrevealed !== null ? STATS.maxunrevealed.toString() : '-';
    } else {
        for (let player = 0; player < NUMOFPLAYERS; player++) {
            document.getElementById(`player${player + 1}wonroundsCount`).innerText = STATS[`player${player + 1}`].wonrounds.toString();
            document.getElementById(`player${player + 1}totalguessesCount`).innerText = STATS[`player${player + 1}`].totalguesses.toString();
            document.getElementById(`player${player + 1}totalpointsCount`).innerText = STATS[`player${player + 1}`].totalpoints.toString();
            document.getElementById(`player${player + 1}minguessesCount`).innerText = STATS[`player${player + 1}`].minguesses !== null ? STATS[`player${player + 1}`].minguesses.toString() : '-';
            document.getElementById(`player${player + 1}maxunrevealedCount`).innerText = STATS[`player${player + 1}`].maxunrevealed !== null ? STATS[`player${player + 1}`].maxunrevealed.toString() : '-';
        }
    }
    // Also update current player display
    let playerDisplay = document.getElementById('currentPlayer');
    playerDisplay.firstElementChild.firstElementChild.textContent = `Játékos ${GAMESTATE.currentPlayer + 1}`;
}
/**
 * Converts a Set to a string with a given delimiter.
 * 
 * @function set_to_string
 * @param {Set} set - The Set to convert
 * @param {string} [delim=''] - String to separate the elements
 * @param {boolean} [delimfirst=false] - Whether to prepend a delimiter
 * @param {boolean} [delimend=true] - Whether to append a delimiter
 * @returns {string} String representation of the Set
 */
function set_to_string(set, delim='', delimfirst=false, delimend=true) {
    return (delimfirst ? delim : '') + Array.from(set).join(delim) + (delimend ? delim : '');
}

/**
 * Masks the verse text by replacing unrevealed words with underscores.
 * 
 * Preserves punctuation marks and supports negative indexing for word positions.
 * 
 * @function masktext
 * @param {string} [text=""] - The verse text to mask
 * @param {Set} [revealedwords=new Set()] - Set of word indices to reveal (supports negative indexing)
 * @returns {string} The masked text with unrevealed words replaced by underscores
 */
function masktext(text="", revealedwords=new Set()) {
    let words = text.trim().split(' ');
    let punctuations = new Set(['\n', '.', ',', ';', ':', '!', '?', '(', ')', '[', ']', '{', '}', '"', "'", '„', '″', '“', '”', '‟']);
    let pstring = set_to_string(punctuations, '\\', true, false);

    // Clean revealedwords set and convert from -index notation
    revealedwords.forEach(revindex => {
        if (revindex >= words.length) {
            revealedwords.delete(revindex);
        }
    });
    revealedwords = new Set([...revealedwords].map(index => index < 0 ? words.length + index : index));
    if (DEBUGMODE) console.log("Revealed words after cleaning:", revealedwords);

    // If not in revealedwords, replace all non-punctuation characters with underscores
    let maskedWords = words.map((word, index) => {
        return revealedwords.has(index) ? word : word.replace(new RegExp(`[^${pstring}]`, 'g'), '_');
    });
    return maskedWords.join(' ');
}

/**
 * Updates the full page with the current verse text, revealed word count, and input/stats information.
 * 
 * Displays masked or full verse text based on game state, updates revealed word counter,
 * and refreshes input fields and statistics display.
 * 
 * @function update_page
 * @returns {void}
 */
function update_page() {
    // Update verse text display
    GAMESTATE.allwords = VERSETEXT.split(' ').length;
    if (GAMESTATE.guessed) {
        document.getElementById("verseText").innerText = VERSETEXT + ` – ${get_abbr(VERSELOC[0])} ${VERSELOC[1]},${VERSELOC[2]}`;
    } else {
        document.getElementById("verseText").innerText = masktext(VERSETEXT, GAMESTATE.revealedWords);
    }

    // Update revealed words count display under the verse text
    document.getElementById('revealedWordsCount').innerText = `${GAMESTATE.revealedWords.size} / ${GAMESTATE.allwords}`;
    
    // Update input fields and statistics with current verse location
    update_inputs();
    update_stats_display();
}

/**
 * Reveals a random unrevealed word in the current verse text.
 * 
 * Disables the reveal button when all words have been revealed or the verse is guessed.
 * 
 * @function revealWord
 * @param {HTMLElement|null} [revbtn=null] - The reveal button element to disable when done
 * @returns {void}
 */
function revealWord(revbtn=null) {
    if (GAMESTATE.revealedWords.size >= GAMESTATE.allwords || GAMESTATE.guessed) {
        revbtn.setAttribute('disabled', '');
        return; // All words already revealed
    }
    let wordtoreveal = Math.floor(Math.random() * GAMESTATE.allwords);
    while (GAMESTATE.revealedWords.has(wordtoreveal) || GAMESTATE.revealedWords.has(wordtoreveal - GAMESTATE.allwords)) {
        wordtoreveal = Math.floor(Math.random() * GAMESTATE.allwords);
    }
    GAMESTATE.revealedWords.add(wordtoreveal);
    update_page();
    if (DEBUGMODE) console.log(`words revealed: ${GAMESTATE.revealedWords.size}/${GAMESTATE.allwords}`, GAMESTATE.revealedWords);
    if (GAMESTATE.revealedWords.size >= GAMESTATE.allwords) {
        revbtn.setAttribute('disabled', '');
    }
}

/**
 * Prompts the user before proceeding to the next verse if the current verse hasn't been guessed yet.
 * 
 * If the verse has been guessed, it directly calls nextVerse(). Otherwise, it shows a confirmation popup.
 * @function nextVersePopup
 * @returns {void}
 */
function nextVersePopup() {
    if (GAMESTATE.guessed) nextVerse();
    else {
        alertPopup("Még nem találtad ki a verset! Biztosan továbblépsz?", "Figyelem!", "Igen", "Mégse", () => {
            nextVerse();
        });
    }
}

/**
 * Loads and displays the next Bible verse, resets game state and input fields.
 * 
 * Clears guesses, resets input fields and buttons, clears the guesses list, and calls new_verse_on_page().
 * 
 * @function nextVerse
 * @returns {void}
 */
function nextVerse() {
    GUESSES = NUMOFPLAYERS > 1 ? Array.from({length: NUMOFPLAYERS}, () => []) : [];
    // Reset input fields and enable them
    let bookinput = document.getElementById("bookInput");
    let chapterinput = document.getElementById("chapterInput");
    let verseinput = document.getElementById("verseInput");
    bookinput.value = '';
    chapterinput.value = '';
    verseinput.value = '';
    bookinput.disabled = false;
    chapterinput.disabled = false;
    verseinput.disabled = false;
    document.getElementById('guessButton').removeAttribute('disabled');
    document.getElementById('revealButton').removeAttribute('disabled');
    document.querySelector('.guesses-list').innerHTML = '<span class="idle">Nincsenek tippek még.<abbr title="A tippeid eredményei itt fognak megjelenni.">🤷</abbr></span>';
    new_verse_on_page();
    if (DEBUGMODE) console.log(GAMESTATE);
}

/**
 * Loads and displays a new random Bible verse on the page for a new round.
 * 
 * Increments played rounds counter, selects a random verse, loads its text, sets up the starting player,
 * and automatically reveals first and last words in autoreveal mode.
 * 
 * @function new_verse_on_page
 * @returns {void}
 */
function new_verse_on_page() {
    let newplayedrounds = GAMESTATE.playedrounds + 1;
    GAMESTATE = {
        playedrounds: newplayedrounds,
        starterplayer: newplayedrounds % NUMOFPLAYERS,
        currentPlayer: newplayedrounds % NUMOFPLAYERS,
        revealedWords: new Set(),
        allwords: 0,
        guessed: false,
    };
    VERSELOC = DEBUGMODE ? [6, 1, 1] : random_verse();
    VERSETEXT = load_verse(BIBLE[VERSELOC[0]].code, VERSELOC[1], VERSELOC[2], DEFAULTTRANS);
    if (AUTOREVEAL) {
        // Reveal the first and last words automatically
        GAMESTATE.revealedWords.add(0);
        GAMESTATE.revealedWords.add(-1);
    }
    update_page();
}

/**
 * Sets up multiplayer game mode with individual player statistics display.
 * 
 * Creates player stat cards in the DOM, initializes player-specific tracking in STATS object,
 * and sets up the current player display.
 * 
 * @function multiplayer_setup
 * @returns {void}
 */
function multiplayer_setup() {
    let playerDisplay = document.getElementById('currentPlayer');
    playerDisplay.style.display = 'block';

    STATS = {};
    for (let player = 0; player < NUMOFPLAYERS; player++) {
        STATS[`player${player + 1}`] = {
            wonrounds: 0,
            totalguesses: 0,
            totalpoints: 0,
            minguesses: null,
            maxunrevealed: null,
        };
    }

    GUESSES = Array.from({length: NUMOFPLAYERS}, () => []);
    
    let statsSec = document.querySelector('.stats-section > .stats-grid');
    Array.from(statsSec.childNodes).forEach(statItem => {
        try {
            statItem.remove();
        } catch (e) {}});
    statsSec.style.display = 'flex';
    statsSec.style.flexDirection = 'row';
    for (player = 0; player < NUMOFPLAYERS; player++) {
        let playerStatDiv = document.createElement('div');
        playerStatDiv.className = 'player-stats';
        let playerTitle = document.createElement('h3');
        playerTitle.textContent = `Játékos ${player + 1}`;
        playerStatDiv.appendChild(playerTitle);
        let statsList = document.createElement('div');
        statsList.className = 'stats-list';
        const statNames = ['Nyert játékok száma', 'Összes tipp', 'Összes pont', 'Legkevesebb tippből kitalált', 'Legtöbb felfedetlenből kitalált'];
        statNames.forEach(statName => {
            let statItem = document.createElement('div');
            statItem.className = 'stat-item';
            let statLabel = document.createElement('div');
            statLabel.className = 'stat-label';
            statLabel.textContent = statName;
            let statValue = document.createElement('div');
            statValue.className = 'stat-value';
            statValue.id = `player${player + 1}${Object.keys(STATS[`player${player + 1}`])[statNames.indexOf(statName)]}Count`;
            statValue.textContent = '0';
            statItem.appendChild(statLabel);
            statItem.appendChild(statValue);
            statsList.appendChild(statItem);
        });
        playerStatDiv.appendChild(statsList);
        statsSec.appendChild(playerStatDiv);
    }
}

/**
 * Starts a new Bible verse guessing game.
 * 
 * Initializes multiplayer setup if needed and loads the first verse.
 * 
 * @function start_new_game
 * @returns {void}
 */
function start_new_game() {
    if (NUMOFPLAYERS > 1) {
        multiplayer_setup();
    }
    new_verse_on_page();
}

window.onload = function() {
    loadPointLogicFromURL();
    reconstruct_bible_dict();
    setup_input_listeners();
    start_new_game();
}