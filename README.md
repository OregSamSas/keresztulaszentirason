
# Keresztül a Szentíráson

A Hungarian Bible Verse Guessing Quizgame web application published under [https://oregsamsas.github.io/keresztulaszentirason](https://oregsamsas.github.io/keresztulaszentirason).

The Bible books in the book dropdown are from the catholic scriptures, although when a protestant translation is used (as by default for example), verses won't be generated from there.

## | ✝️_kereszt________|

## | 🪑_ül______________|

## | 📖_a_Szentíráson_|

## Multiplayer mode

The game offers a multiplayer mode, in which multiple players can compete with each other who guesses the location of the verse at first (see #Customisation to learn how to access it)

## Feedback on guesses and way of scoring points

You guess a word, which will appear in a list under the input field. On the right of each guess you will see an arrow either pointing to the right or to the left. The first tells you that the verse to be guessed is from later in the Bible, the latter will tell you the opposite. If you guess corectly, the game will end, and each player will earn points. Bonus points will be given for the players guessing the Testament (✝️🏆), Book (📖🏆) and chapter (📄🏆) for the first time. Statistics (you can see at the bottom of the page) will be updated at this point.

## Statistics

At the bottom of the page, you can follow your game stats. Won rounds, points earned so far, total number of guesses.

And two, more interesting stats: least guesses used and least word revelation. (Max number of unrevealed words, when correctly guessing.) Sadly, it won't be saved, and it cannot be exported. (You can take a snapshot however of your stats and share it with whom you'd like to.)

## Customisation

The game can be customised via [URL parameters](https://en.wikipedia.org/wiki/Query_string).

* `version` [*str*]: the bible translation used for target verse text and location (if not specified, default version is RÚF 2014)
* `players` [*int*]: to access multiplayer mode, insert this parameter into the URL, and specify the number of players
* `autoreveal` [*bool*]: if set true (as by default!), on game start, the first and last word of the verse will be automatically revealed and a new one after each guess (or player's round if multiplayer), you can disable this automatic behaviour by setting this parameter false
* `headings` [*bool*]: if set true, titles of chapters, and subchapters will be also displayed as part of the verses in double brackets
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
