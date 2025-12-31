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
]

const POINTLOGIC = {
    // Logic of awarding points based on number of revealed words and guesses
    base: 10, // Base points for a correct guess
    perUnrevealedWord: 1, // Points per unrevealed word
    perRevealedWord: 0, // Points deducted per revealed word
    testamentBonus: 3, // Bonus points for the player who guessed the correct testament (OT/NT) (first if multiplayer)
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

var DEFAULTTRANS = "RUF";
var VERSETEXT = "";
var VERSELOC = [0, 1, 1]; // [booknum, chapter, verse]
const NUMOFPLAYERS = parseInt(new URLSearchParams(window.location.search).get('players')) || 1;
const AUTOREVEAL = (['true', '1', 'yes'].includes(new URLSearchParams(window.location.search).get('autoreveal'))) ? true : false;
var STATS = {
    rounds: 0,
    totalguesses: 0,
    totalpoints: 0,
    minGuesses: null,
    minRevealed: null,
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

function reconstruct_bible_dict() {    
    req = new XMLHttpRequest();
    req.open("GET", "bible_booklengths.json", false);
    req.send(null);
    BIBLE = JSON.parse(req.responseText);
    if (DEBUGMODE) console.log("Loaded Bible data:", BIBLE);
}

function verse_url(bnum=0, chapter=1, verse=1, translation="SZIT") {
    /**
     * Get the appropriate link for a Bible verse from szentiras.eu API
     * bnum: book number (0-based index in BIBLE array)
     * chapter: chapter number
     * verse: verse number
     * translation: translation code (e.g., "SZIT"), or "all" for retrieving all translations
     * Returns: URL to fetch the verse data
     */
    let location = ''
    if (translation === 'all') {
        location = `${BIBLE[bnum].code}_${chapter.toString()}_${verse.toString()}`;
    } else {
        location = `${BIBLE[bnum].sortName}%20${chapter.toString()},${verse.toString()}`;
    }
    let url = `https://szentiras.eu/api/${translation === "all" ? "forditasok" : "ref"}/${location}`
    url += (translation === "all" ? "" : `/${translation}`);

    return url;
}

function getbooknumforentry(entry, forcefulltext=false) {
    /**
     * Get the book number (0-based index in BIBLE) for a given book entry (USX code or abbrev)
     * entry: USX book code or abbrev (e.g., "Jn" or "Ján")
     * Returns: book number (0-based index in BIBLE), or -1 if not found
     */
    let booknum = BIBLE.indexOf(BIBLE.find(b => b.name + ` (${b.sortName})` === entry));
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
    return booknum;
}

function trimtext(txt) {
    /**
     * Trim trailing, leading whitespace, replace multiple spaces with single space 
     */
    return txt.replace(/\s+/g, ' ').trim();
}

function load_verse(book="Jn", chapter=3, verse=16, translation="SZIT") {
    /**
     * Load a Bible verse from szentiras.eu API
     * book: USX book code or abbrev (e.g., "Jn" or "Ján")
     * chapter: chapter number
     * verse: verse number
     * translation: translation code (e.g., "SZIT"), or "all" for retrieving all translations
     * Returns: The text (or texts array of the different translations if "all" was requested) of the verse, or null if not found (invalid book/chapter/verse or not being able to fetch)
     */
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
    let url = (DEBUGMODE) ? 'plreq.json' : verse_url(booknum, chapter, verse, translation);
    let req = new XMLHttpRequest();
    req.open("GET", url, false);
    req.send(null);
    if (req.status === 200) {
        let response = JSON.parse(req.responseText);
        if (translation === "all") {
            let texts = {};
            for (let t in response.valasz.versek) {
                let text = trimtext(response.valasz.versek[t].szoveg);
                let transCode = response.valasz.versek[t].forditas.szov;
                texts[t] = {text: text, translation: transCode};
            }
            return texts;
        } else {
            if (DEBUGMODE) console.log(`Verse loaded: ${response['canonicalUrl']}`)
            return trimtext(response.text);
        }
    } else {
        console.log(`Error fetching verse (${url}): ${req.status}`);
        return null;
    }
}

function check_translation_availability(booknum=0, translation="SZIT") {
    /**
     * Check if a given translation contains the specified book
     * booknum: book number (0-based index in BIBLE array)
     * translation: translation code (e.g., "SZIT") or translation type (e.g., "catholic")
     * Returns: true if the translation contains the book, false otherwise
     */
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

function random_verse() {
    /**
     * Get a random Bible verse location
     * Returns: An array with booknum (0-based index in BIBLE), chapter, verse
     */
    let booknum = Math.floor(Math.random() * BIBLE.length);
    while (!check_translation_availability(booknum, DEFAULTTRANS)) {
        booknum = Math.floor(Math.random() * BIBLE.length);
    }
    let chapter = Math.floor(Math.random() * BIBLE[booknum].chapters.length) + 1;
    let verse = Math.floor(Math.random() * BIBLE[booknum].chapters[chapter - 1]) + 1;
    return [booknum, chapter, verse];
}

function input_focusout (func=() => {}, container=null) {
    setTimeout(() => {
        if (container) {
            container.style.display = 'none';
        }
        func();
    }, 10);
}

function add_dropdown_for_input(inputElement=null, options=[], focusoutfunc=() => {}, eventstamp=0) {
    if (DEBUGMODE)console.log("Adding dropdown for input:", inputElement, options);
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
                inputElement.dataset.eventstamp = (parseInt(inputElement.dataset.eventstamp) + 1).toString();
            }, 10);
        });
}

function refreshbookdropdown(bookinput=document.getElementById("bookInput")) {
    let bookIdentifs = BIBLE.map(b => [b.code].concat(b.abbrevs).concat([b.name]));
    let bookOptions = BIBLE.map(b => b.name + ` (${b.sortName})`);
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

function refreshchapterorversedropdown(numberinpid='chapterInput', bookinputid='bookInput', versemode=false, chapterid='chapterInput') {
    let numberOptions = [];
    let booknum = getbooknumforentry(document.getElementById(bookinputid).value);
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

function award_guess(guessnum, type) {
    try {
        document.querySelector(`#guessesList span:nth-child(${guessnum + 1}) abbr`).textContent += `  ${type}🏆`;
    } catch (e) {
        if (DEBUGMODE) console.error("Error updating testament bonus display:", e);
    }
}


function pointsforplayers() {
    let points = POINTLOGIC.base;
    points += POINTLOGIC.perUnrevealedWord * (GAMESTATE.allwords - GAMESTATE.revealedWords.size);
    points += POINTLOGIC.perRevealedWord * GAMESTATE.revealedWords.size;
    if (NUMOFPLAYERS === 1) {
        // Single player mode: add all bonuses
        points += POINTLOGIC.testamentBonus;
        points += POINTLOGIC.bookBonus;
        points += POINTLOGIC.chapterBonus;
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

function checkGuess() {
    /**
     * Handle the guessing logic for the Bible verse guessing game
     */
    let bookinput = document.getElementById("bookInput");
    let chapterinput = document.getElementById("chapterInput");
    let verseinput = document.getElementById("verseInput");

    let guessedloc = [
        getbooknumforentry(bookinput.value),
        parseInt(chapterinput.value) || 1,
        parseInt(verseinput.value) || 1
    ];

    if (guessedloc[0] === -1 ||
        guessedloc[1] < 1 || guessedloc[1] > BIBLE[guessedloc[0]].chapters.length ||
        guessedloc[2] < 1 || guessedloc[2] > BIBLE[guessedloc[0]].chapters[guessedloc[1] - 1]) {
        alert("Érvénytelen könyv, fejezet vagy vers szám!");
        return;
    }

    // Create display text for guessed location
    let guessedBookName = BIBLE[guessedloc[0]].sortName;
    let guessText = `${guessedBookName} ${guessedloc[1]},${guessedloc[2]}`;
    
    // Create span element
    let guessSpan = document.createElement('span');
    guessSpan.textContent = guessText;
    let resultSpan = document.createElement('abbr');
    guessSpan.appendChild(resultSpan);
    
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
    
    // Evaluate guess and add emoji
    if (guessedloc[0] === VERSELOC[0] && guessedloc[1] === VERSELOC[1] && guessedloc[2] === VERSELOC[2]) {
        GAMESTATE.guessed = true;
        
        resultSpan.textContent = '🎉';
        guessSpan.style.backgroundColor = 'var(--success-color)';
        playerNote.style.color = 'white';
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
            if (STATS.minRevealed === null || GAMESTATE.revealedWords.size < STATS.minRevealed) {
                STATS.minRevealed = GAMESTATE.revealedWords.size;
            }
            if (STATS.minGuesses === null || GUESSES.length < STATS.minGuesses) {
                STATS.minGuesses = GUESSES.length;
            }
        } else {
            if (DEBUGMODE) console.log("Player", GAMESTATE.currentPlayer + 1, "guesses:", GUESSES[GAMESTATE.currentPlayer].length, "current min guesses:", STATS[`player${GAMESTATE.currentPlayer + 1}`].minguesses);
            if (STATS[`player${GAMESTATE.currentPlayer + 1}`].minrevealed === null || GAMESTATE.revealedWords.size < STATS[`player${GAMESTATE.currentPlayer + 1}`].minrevealed) {
                STATS[`player${GAMESTATE.currentPlayer + 1}`].minrevealed = GAMESTATE.revealedWords.size;
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
 * Updates input fields with the current verse location and sets up event listeners
 * for the book input field to provide autocomplete suggestions.
 * 
 * @function update_inputs
 * @description
 * - Retrieves references to book, chapter, and verse input elements from the DOM
 * - Attaches a 'focus' event listener to the book input that:
 *   - Generates a list of book options from the BIBLE data structure
 *   - Ranks book options based on matches with the current input value
 *     (includes/contains, starts with, and exact matches receive different scores)
 *   - Sorts options by relevance rank in descending order
 *   - Displays matching book suggestions via a dropdown
 * - Sets the selected book number based on the current book input value
 * 
 * @returns {void}
 * 
 */
function update_inputs() {
    bookinput = document.getElementById("bookInput");
    chapterinput = document.getElementById("chapterInput");
    verseinput = document.getElementById("verseInput");

    if (!bookinput.dataset.listenersAdded) {
        bookinput.addEventListener('focus', () => setTimeout(() => refreshbookdropdown(bookinput), 10));
        bookinput.addEventListener('input', () => setTimeout(() => refreshbookdropdown(bookinput), 10));
        bookinput.dataset.listenersAdded = 'true';
    }
    if (!chapterinput.dataset.listenersAdded) {
        chapterinput.addEventListener('focus', () => {
            setTimeout(() => {
                refreshchapterorversedropdown('chapterInput', 'bookInput', 0);
            }, 10);
        });
        chapterinput.dataset.listenersAdded = 'true';
    }
    if (!verseinput.dataset.listenersAdded) {
        verseinput.addEventListener('focus', () => {
            setTimeout(() => refreshchapterorversedropdown('verseInput', 'bookInput', true), 10);
        });
        verseinput.dataset.listenersAdded = 'true';
    }
    selectedBookNum = getbooknumforentry(bookinput.value);
}

function update_stats_display() {
    /**
     * Update the statistics display on the page
     */
    // Update statistics display
    if (NUMOFPLAYERS === 1) {
        document.getElementById("gamesCount").innerText = GAMESTATE.playedrounds.toString();
        document.getElementById("roundsCount").innerText = STATS.rounds.toString();
        document.getElementById("guessesCount").innerText = STATS.totalguesses.toString();
        document.getElementById("pointsCount").innerText = STATS.totalpoints.toString();
        document.getElementById("minguessCount").innerText = STATS.minGuesses !== null ? STATS.minGuesses.toString() : '-';
        document.getElementById("minrevealedCount").innerText = STATS.minRevealed !== null ? STATS.minRevealed.toString() : '-';
    } else {
        for (let player = 0; player < NUMOFPLAYERS; player++) {
            document.getElementById(`player${player + 1}wonroundsCount`).innerText = STATS[`player${player + 1}`].wonrounds.toString();
            document.getElementById(`player${player + 1}totalguessesCount`).innerText = STATS[`player${player + 1}`].totalguesses.toString();
            document.getElementById(`player${player + 1}totalpointsCount`).innerText = STATS[`player${player + 1}`].totalpoints.toString();
            document.getElementById(`player${player + 1}minguessesCount`).innerText = STATS[`player${player + 1}`].minguesses !== null ? STATS[`player${player + 1}`].minguesses.toString() : '-';
            document.getElementById(`player${player + 1}minrevealedCount`).innerText = STATS[`player${player + 1}`].minrevealed !== null ? STATS[`player${player + 1}`].minrevealed.toString() : '-';
        }
    }
    // Also update current player display
    let playerDisplay = document.getElementById('currentPlayer');
    playerDisplay.firstElementChild.textContent = `Játékos ${GAMESTATE.currentPlayer + 1}`;
}
function set_to_string(set, delim='', delimfirst=false, delimend=true) {
    /**
     * Simple utility to convert a Set to a string with a given delimiter
     * delimiter: string to separate the elements
     * Returns: string representation of the Set
     */
    return (delimfirst ? delim : '') + Array.from(set).join(delim) + (delimend ? delim : '');
}

function masktext(text="", revealedwords=new Set()) {
    /**
     * Mask the verse text by replacing unrevealed words with underscores
     */
    let words = text.split(' ');
    let punctuations = new Set(['.', ',', ';', ':', '!', '?', '(', ')', '[', ']', '{', '}', '"', "'", '„', '″', '“', '”', '‟']);
    let pstring = set_to_string(punctuations, '\\', true, false);

    // Clean revealedwords set and convert from -index notation
    // revealedwords.forEach(revindex => {
    //     if (revindex >= words.length) {
    //         revealedwords.delete(revindex);
    //     }
    // })
    revealedwords = new Set([...revealedwords].map(index => index < 0 ? words.length + index : index));
    console.log("Revealed words after cleaning:", revealedwords);

    // If not in revealedwords, replace all non-punctuation characters with underscores
    let maskedWords = words.map((word, index) => {
        return revealedwords.has(index) ? word : word.replace(new RegExp(`[^${pstring}]`, 'g'), '_');
    });
    return maskedWords.join(' ');
}

function update_page() {
    /**
     * Update the full page with the current verse text and other info
     */
    // Update verse text display
    GAMESTATE.allwords = VERSETEXT.split(' ').length;
    if (GAMESTATE.guessed) {
        document.getElementById("verseText").innerText = VERSETEXT;
    } else {
        document.getElementById("verseText").innerText = masktext(VERSETEXT, GAMESTATE.revealedWords);
    }

    // Update revealed words count display under the verse text
    document.getElementById('revealedWordsCount').innerText = `${GAMESTATE.revealedWords.size} / ${GAMESTATE.allwords}`;
    
    // Update input fields and statistics with current verse location
    update_inputs();
    update_stats_display();
}

function revealWord(revbtn=null) {
    /**
     * Reveal a random unrevealed word in the current verse text
     */
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

function nextVerse() {
    /**
     * Load and display the next Bible verse, reset game state
     */
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
    console.log(GAMESTATE)
}

function new_verse_on_page() {
    /**
     * Load and display a new random Bible verse on the page
     */
    let newplayedrounds = GAMESTATE.playedrounds + 1;
    GAMESTATE = {
        playedrounds: newplayedrounds,
        starterplayer: newplayedrounds % NUMOFPLAYERS,
        currentPlayer: newplayedrounds % NUMOFPLAYERS,
        revealedWords: new Set(),
        allwords: 0,
        guessed: false,
    };
    VERSELOC = DEBUGMODE ? [16, 1, 1] : random_verse();
    VERSETEXT = load_verse(BIBLE[VERSELOC[0]].code, VERSELOC[1], VERSELOC[2], DEFAULTTRANS);
    if (AUTOREVEAL) {
        // Reveal the first and last words automatically
        GAMESTATE.revealedWords.add(0);
        GAMESTATE.revealedWords.add(-1);
    }
    update_page();
}

function multiplayer_setup() {
    /**
     * Setup multiplayer statistics tracking
     */
    let playerDisplay = document.getElementById('currentPlayer');
    playerDisplay.style.display = 'block';
    playerDisplay.firstElementChild.textContent = `Játékos 1`;

    STATS = {};
    for (let player = 0; player < NUMOFPLAYERS; player++) {
        STATS[`player${player + 1}`] = {
            wonrounds: 0,
            totalguesses: 0,
            totalpoints: 0,
            minguesses: null,
            minrevealed: null,
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
        const statNames = ['Nyert játékok száma', 'Összes tipp', 'Összes pont', 'Legkevesebb tippből kitalált', 'Legkevesebb szóból kitalált'];
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

function start_new_game() {
    /**
     * Start a new Bible verse guessing game
     */
    if (NUMOFPLAYERS > 1) {
        multiplayer_setup();
    }
    new_verse_on_page();
}

window.onload = function() {
    loadPointLogicFromURL();
    reconstruct_bible_dict();
    start_new_game();
}