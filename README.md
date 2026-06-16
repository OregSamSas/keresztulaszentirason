
# Keresztül a Szentíráson

A Hungarian Bible Verse Guessing Quizgame web application published under [https://oregsamsas.github.io/keresztulaszentirason](https://oregsamsas.github.io/keresztulaszentirason).

The core idea of the trivia game is simply to determine the location of a randomly selected secret verse from the Bible, by guessing locations repeatedly and using clues returned for them. The game is for one player by default, but it also offers a more useful and exciting multiplayer mode (see: [#Multiplayer mode](#multiplayer-mode)).

The Bible book names are originally from the catholic scriptures, but all names and abbreviations are accepted. When a protestant translation is used (as by default for example...), protestant names and abbreviations will be used if available, and verses won't be generated from deuterocanonical scriptures.

## | ✝️_kereszt________|

## | 🪑_ül______________|

## | 📖_a_Szentíráson_|

## ⚠️ Important note ⚠️: API keys

The game uses an [external provider (Szentiras.eu)](https://szentiras.eu/api) for accessing the text content of passages from Scripture. As of 01/04/2026, this third party provider needs a correct API key to serve requests, which you have to obtain for yourself in order to use the game. Otherwise, texts won't render. (Neither for the "secret verse" nor for guessed items.) You can ask for such a token by emailing the developers of Szentiras.eu, as it is described in the previously mentioned link. 

* Note: I know it was April Fool's day, but it's still serious. You have to have an API key to make this game function.

Once you have a working API key, you should include it in your URL as a parameter.
**Example**: if you have an API key: `123ab-456cd-789ef`, then you should type the address `https://oregsamsas.github.io/keresztulaszentirason/?token=123ab-456cd-789ef`

## Multiplayer mode

The game offers a multiplayer mode, in which multiple players can compete with each other who guesses the location of the verse at first (see [#Customisation](#customisation) to learn how to access it)

## Feedback on guesses and way of scoring points

You guess a verse (enter a book and a chapter and verse number, the latter can be automatically filled if URL param is given), which will appear in a list under the input field. On the right of each guess you will see an arrow either pointing to the right (➡️) or to the left (⬅️). The first tells you that the verse to be guessed is from later in the Bible, the latter will tell you the opposite. If you guess corectly, the game will end, and each player will earn points. Bonus points will be given for the players guessing the Testament (✝️🏆), Book (📖🏆) and chapter (📄🏆) for the first time. Statistics (you can view under your guesses, see: [#Statistics](#statistics)) will be updated at this point.

## Statistics

At the bottom of the page, you can follow your game stats. Won rounds, points earned so far, total number of guesses.

And two, more interesting stats: least guesses used and least word revelation. (Max number of unrevealed words, when correctly guessing.) Sadly, it won't be saved, and it cannot be exported. (You can take a snapshot however of your stats and share it with whom you'd like to.)

## Customisation

The game can be customised via [URL parameters](https://en.wikipedia.org/wiki/Query_string).

* `token` [*str*]: the personal API key to access Bible passages from the external provider (see: [#API keys](#%EF%B8%8F-important-note-%EF%B8%8F-api-keys))
* `version` [*str*]: the Bible translation used for target verse text and location (if not specified, default version is RÚF 2014)
* `players` [*int*]: to access multiplayer mode, insert this parameter into the URL, and specify the number of players
* `autoreveal` [*bool*]: if set true (as by default!), on game start, the first and last word of the verse will be automatically revealed and a new one after each guess (or player's round if multiplayer), you can disable this automatic behaviour by setting this parameter false
* `headings` [*bool*]: if set true, titles of chapters, and subchapters will be also displayed as part of the verses in double brackets
* `guessversenumber` [*bool*]: to enable automatic revealing of correct verse number
* `debug` [*bool*]: parameter to set debug mode on (debug mode will log processes and use the same bible verse (Judges 1:1) from [plreq.json](plreq.json), in order to spare yourself from fetching verses a hundred times when tested over and over again)
* `darkmode` [*bool*]: dark mode preference can be set by URL parameters to override the browser's default (if value is not 0, true, yes or 1, false, no then the parameter will have no effect, default preference will be selected)
* `pointcalc` [*array*]: list defining the point scoring logic.
  * 1st: base points earned when guessed correctly
  * 2nd: points earned after each unrevealed words
  * 3rd: points earned or lost (if negative!) after each revealed words
  * 4th: bonus points for the player who guessed the correct testament (OT/NT) for the first time (in one player mode, you automatically get it on guessing correctly, it has significance in multiplayer mode)
  * 5th: bonus points for book (the same appliesas for 4th item)
  * 6th: bonus points for chapter (here too)
* The **default point** calculating **logic** is equvivalent to the following list: `12,1,0,2,5,9`

## Credits

* Bible verses are fetched from szentiras.eu, using ther [API](https://szentiras.eu/api)
* Huge thanks to the developers of szentiras.eu, i.e. the group Szent József Hackathon and furthermore, the Szent Jeremos Bibliatársulat, the maintaner of the website szentiras.hu
* USX codes for the books of the Bible are collected from [ubsicap's repo](https://github.com/ubsicap/usx/blob/master/schema/usx_2.6.rnc)
* Chapter and verse counts are collected from the Biblemap object found at [ujevangelizacio.hu](https://halld.ujevangelizacio.hu/biblemap.html)
* Oh, and GitHub Copilot helped me a lot on the way 😊
