// Init tracked things
var clearStorageButton = undefined;
let me = '';
const targetValue = 4
let trackedIds = {};
let allResults = [];
let wrath = document.getElementById("wrath");
let debug = false;

// Init counts
let countIcon = 0;
let countExalted = 0;
let countCrit = 0;
let countComplication = 0;
let totalSuccesses = 0;
let damage = 0;


// Other
let crit = "";
let compl = "";
let colorCrit = `<color="white">`
let colorCompl = `<color="white">`

// To facilitate the checkbox insertion
function insertAfter(newNode, existingNode) {
    existingNode.parentNode.insertBefore(newNode, existingNode.nextSibling);
}

// Take the name of the player 
async function findMe() {
    me = await TS.players.whoAmI().then(result => result.name);
}

function initSheet() {
    let inputs = document.querySelectorAll("input,button,textarea");

    // I didn't touch this for potential use later on
    for (let input of inputs) {
        if (input.id != undefined && input.id != "clear-storage") {
            input.addEventListener("change", function () {
                onInputChange(input)
            });

            let titleSibling = findFirstSiblingWithClass(input, "field-title");
            if (titleSibling != null) {
                titleSibling.id = `${input.id}-field-title`;
            }
            let descSibling = findFirstSiblingWithClass(input, "field-desc");
            if (descSibling != null) {
                descSibling.id = `${input.id}-field-desc`;
            }

            let finalInput = input; //otherwise the input can change which breaks the onchange handler
            if (titleSibling == null && input.dataset.modifier != undefined) {
                //manual fix for melee/ranged attack buttons being formatted differently
                titleSibling = finalInput;
                finalInput = document.getElementById(finalInput.dataset.modifier);
            }

            if (titleSibling != null && titleSibling.dataset.diceType != undefined) {
                titleSibling.classList.add("interactible-title");
                titleSibling.style.cursor = "pointer";
                titleSibling.addEventListener("click", function () {
                    TS.dice.putDiceInTray([createDiceRoll(titleSibling, finalInput)])
                    //we are not checking for success or failure here, but could easily by adding a .then (success) and .catch (failure)
                });
                input.setAttribute("aria-labelledby", titleSibling.id);
                if (descSibling != null) {
                    input.setAttribute("aria-describedby", descSibling.id);
                }
            } else if (titleSibling != null) {
                titleSibling.setAttribute("for", input.id);
                if (descSibling != null) {
                    input.setAttribute("aria-describedby", descSibling.id);
                }
            }
        }
    }

    //   Handle our tabs
    Array.from(document.querySelectorAll('.tabs')).forEach((tab_container, TabID) => {
        const registers = tab_container.querySelector('.tab-registers');
        const bodies = tab_container.querySelector('.tab-bodies');

        Array.from(registers.children).forEach((el, i) => {
            el.setAttribute('aria-controls', `${TabID}_${i}`)
            bodies.children[i]?.setAttribute('id', `${TabID}_${i}`)

            el.addEventListener('click', (ev) => {
                let activeRegister = registers.querySelector('.active-tab');
                activeRegister.classList.remove('active-tab')
                activeRegister = el;
                activeRegister.classList.add('active-tab')
                changeBody(registers, bodies, activeRegister)
            })
        })
    })

}

function hideShow(select) {
    const container = select;
    if (container.style.display === "none") {
        container.style.display = "flex";
    } else {
        container.style.display = "none";
    }
}

function changeBody(registers, bodies, activeRegister) {
    Array.from(registers.children).forEach((el, i) => {
        if (bodies.children[i]) {
            bodies.children[i].style.display = el == activeRegister ? 'block' : 'none'
        }

        el.setAttribute('aria-expanded', el == activeRegister ? 'true' : 'false')
    })
}

//handles input changes to store them in local storage
function onInputChange(input) {
    let data;
    // get already stored data
    TS.localStorage.campaign.getBlob().then((storedData) => {
        //parse stored blob as json, but also handle if it's empty by
        //defaulting to an empty json document "{}" if stored data is false
        data = JSON.parse(storedData || "{}");
        if (debug) console.log("data " + JSON.stringify(data))
        if (input.type == "checkbox") {
            data[input.id] = input.checked ? "on" : "off";
        } else {
            data[input.id] = input.value;
        }
        //set new data, handle response
        TS.localStorage.campaign.setBlob(JSON.stringify(data)).then(() => {
            //if storing the data succeeded, enable the clear storage button
            clearStorageButton.classList.add("danger");
            clearStorageButton.disabled = false;
            clearStorageButton.textContent = "Clear Character Sheet";
        }).catch((setBlobResponse) => {
            TS.debug.log("Failed to store change to local storage: " + setBlobResponse.cause);
            console.error("Failed to store change to local storage:", setBlobResponse);
        });
    }).catch((getBlobResponse) => {
        TS.debug.log("Failed to load data from local storage: " + getBlobResponse.cause);
        console.error("Failed to load data from local storage:", getBlobResponse);
    });

    if (input.id == "abilities-text") {
        let actions = parseActions(input.value);
        addActions(actions);
    }

    if (input.id == "wrath") {
        wrath = document.getElementById("wrath")
    }

    if (input.id == "max-wounds") {
        addCheckbox(input.value, input.id)
    }

    if (input.id == "max-shock") {
        addCheckbox(input.value, input.id)
    }
}

function findFirstSiblingWithClass(element, className) {
    let siblings = element.parentElement.children;
    for (let sibling of siblings) {
        if (sibling.classList.contains(className)) {
            return sibling;
        }
    }
    return null;
}

function createDiceRoll(clickElement, inputElement) {
    let modifierString = "";
    if (clickElement.dataset.modifier != "no-mod" && inputElement != null) {
        modifierString = inputElement.value >= 0 ? "+" + inputElement.value : inputElement.value;
    }
    let label = "";
    if (clickElement.dataset.label != undefined) {
        label = clickElement.dataset.label;
    } else {
        label = clickElement.textContent;
    }
    let roll = `${clickElement.dataset.diceType}${modifierString == '+' ? '' : modifierString}`

    //this returns a roll descriptor object. we could be using TS.dice.makeRollDescriptor(`${roll}+${modifierString}`) instead
    //depends mostly on personal preference. using makeRollDescriptor can be safer through updates, but it's also less efficient
    //and would ideally need error handling on the return value (and can be rate limited)
    return { name: label, roll: roll };
}

function roll(clickedEl, inputEl) {
    countIcon = 0;
    countExalted = 0;
    countCrit = 0;
    countComplication = 0;

    const numDice = inputEl.value;
    const rollDesc = numDice + 'd6';

    TS.symbiote.sendNotification(me, rolledMessage(numDice));

    TS.dice.putDiceInTray([{ name: clickedEl.innerHTML, roll: rollDesc }], null)
        .then((rollId) => {
            // The dice roll has been initiated. Store the ID in our TrackedIds
            if (debug) console.log("Roll initiated. Roll ID:", rollId);
            trackedIds[rollId] = 1
        })
        .catch((error) => {
            // Something went wrong initiating the dice roll.
            console.error("Error initiating roll:", error);
        });
}

function parseActions(text) {
    // Other parsing possibilities
    // Original :
    // let results = text.matchAll(/(.*) (\d{0,2}d\d{1,2}[+-]?\d*) ?(.*)/gi);
    // To include more dice complexity :
    // let results = text.matchAll(/(.*) ((?:\d{0,2}d\d{1,2}[+-]?\d*)+) ?(.*)/gi);
    // To follow our W&G weapon pattern :
    let results = text.matchAll(/(.*);(melee|(?:(?:\d{1,2}) (?:\d{1,2}) (?:\d{1,2})));(\d{0,2}d\d{1,2}[+-]?\d*);(-|(?:[1-9]{1}));(-|(?:[1-9]{1}));?(.*)/gi);
    let actions = [];
    for (let result of results) {
        let action = {
            title: result[1],
            range: result[2],
            dice: result[3],
            ap: result[4],
            salvo: result[5],
            description: result[6]
        }
        actions.push(action);
    }
    return actions;
}

function addCheckbox(boxNbre, parent) {
    // Stop process if negative count
    if (boxNbre < 0) return;

    //remove old checkbox
    let oldCheckbox = document.querySelectorAll(`[id^=checkbox-${parent}]`);
    for (let oldBox of oldCheckbox) {
        oldBox.remove();
    }

    let selectedInput = document.getElementById(parent);
    let cell = selectedInput.parentElement;
    let container = cell.parentElement;

    for (let i = 0; i < boxNbre; i++) {
        const newBox = document.createElement("input");
        newBox.type = "checkbox";
        newBox.id = `checkbox-${parent}-${i}`
        newBox.checked = true
        newBox.addEventListener("change", function () {
            onInputChange(newBox)
        });
        insertAfter(newBox, container);
    }
}

function addActions(results) {
    //remove old actions
    let oldActions = document.querySelectorAll("[id^=list-action]");
    for (let oldAction of oldActions) {
        oldAction.remove();
    }

    //add new actions
    let template = document.getElementById("abilities-template");
    let container = template.parentElement;
    for (let i = 0; i < results.length; i++) {
        let clonedAction = template.content.firstElementChild.cloneNode(true);
        clonedAction.id = "list-action" + i;
        let title = clonedAction.querySelector("[id=abilities-template-title]");
        title.removeAttribute("id");
        title.textContent = results[i]["title"];

        let description = clonedAction.querySelector("[id=abilities-template-traits]");
        description.removeAttribute("id");
        description.textContent = results[i]["description"];

        let range = clonedAction.querySelector("[id=abilities-template-range]");
        range.removeAttribute("id");
        range.textContent = results[i]["range"];

        let ap = clonedAction.querySelector("[id=abilities-template-ap]");
        ap.removeAttribute("id");
        ap.textContent = "-" + results[i]["ap"];

        let salvo = clonedAction.querySelector("[id=abilities-template-salvo]");
        salvo.removeAttribute("id");
        salvo.textContent = results[i]["salvo"];

        let button = clonedAction.querySelector("[id=abilities-template-button]");
        button.id = "action-button" + i;
        button.dataset.diceType = results[i]["dice"];
        button.dataset.label = results[i]["title"];
        button.addEventListener("click", function () {
            countIcon = 0;
            countExalted = 0;
            countCrit = 0;
            countComplication = 0;
            TS.symbiote.sendNotification(me, rolledMessage(button.dataset.diceType, true));
            TS.dice.putDiceInTray([createDiceRoll(button, null)]).then((rollId) => {
                // The dice roll has been initiated. Store the ID in our TrackedIds
                if (debug) console.log("Roll initiated. Roll ID:", rollId);
                trackedIds[rollId] = 2
            })
                .catch((error) => {
                    // Something went wrong initiating the dice roll.
                    console.error("Error initiating roll:", error);
                });
        });

        container.insertBefore(clonedAction, document.getElementById("abilities-text").parentNode);
    }
}

function loadStoredData() {
    TS.localStorage.campaign.getBlob().then((storedData) => {
        //localstorage blobs are just unstructured text.
        //this means we can store whatever we like, but we also need to parse it to use it.
        let data = JSON.parse(storedData || "{}");
        if (Object.entries(data).length > 0) {
            clearStorageButton.classList.add("danger");
            clearStorageButton.disabled = false;
            clearStorageButton.textContent = "Clear Character Sheet";
        }
        let keyCount = 0;
        for (let [key, value] of Object.entries(data)) {
            keyCount++;
            let element = document.getElementById(key);
            element.value = value;
            if (element.type == "checkbox") {
                element.checked = value == "on" ? true : false;
            } else if (key == "abilities-text") {
                let results = parseActions(element.value);
                addActions(results);
            } else if (key == "max-wounds") {
                addCheckbox(element.value, key)
            } else if (key == "max-shock") {
                addCheckbox(element.value, key)
            }
        }
        //adding some log information to the symbiote log
        //this doesn't have particular importance, but is here to show how it's done
        if (debug) TS.debug.log(`Loaded ${keyCount} values from storage`);
    });
}

function clearSheet() {
    //clear stored data
    TS.localStorage.campaign.deleteBlob().then(() => {
        //if the delete succeeded (.then), set the UI to reflect that
        clearStorageButton.classList.remove("danger");
        clearStorageButton.disabled = true;
        clearStorageButton.textContent = "Character Sheet Empty";
    }).catch((deleteResponse) => {
        //if the delete failed (.catch), write a message to symbiote log
        TS.debug.log("Failed to delete local storage: " + deleteResponse.cause);
        console.error("Failed to delete local storage:", deleteResponse);
    });

    //clear sheet inputs
    let inputs = document.querySelectorAll("input,textarea");
    for (let input of inputs) {
        switch (input.type) {
            case "button":
                break;
            case "checkbox":
                input.checked = false;
                break;
            default:
                input.value = "";
                break;
        }
    }
}

function onStateChangeEvent(msg) {
    if (msg.kind === "hasInitialized") {
        //the TS Symbiote API has initialized and we can begin the setup. think of this as "init".
        clearStorageButton = document.getElementById("clear-storage");
        loadStoredData();
        initSheet();
        findMe();
    }
}

// Gets the message together when we start a roll
function rolledMessage(numDice, weapon) {

    if (me === '') findMe();

    let message = '<color="orange"><size=120%><align="center">';

    if (weapon) {
        message += `<color="white"><size=100%><align="left">\n<color="white">I'm rolling <color="green">${numDice}<color="white">`;
    } else {
        message += `<color="white"><size=100%><align="left">\n<color="white">I'm rolling <color="green">${numDice}d6<color="white">`;
    }

    return message;
}

function updateResults(results, damage, targetValue, sendChatMessage) {

    let processedResults = results;

    // Process each result
    for (let i = 0; i < processedResults.length; i++) {
        let result = results[i];
        // If it's first dice = wrath dice, update the corresponding counters
        if (i === 0 && wrath.value === "on") {
            if (result === 6) {
                countCrit++;
                countExalted++;
            } else if (result === 1) {
                countComplication++;
            } else if (result >= targetValue && result !== 6) {
                countIcon++;
            }
        } else {
            // If result is 4/5=success or 6=icon Exalted, update the corresponding counters
            if (result === 6) {
                countExalted++;
            } else if (result >= targetValue && result !== 6) {
                countIcon++;
            }
        }
    }
    if (sendChatMessage) {
        TS.symbiote.sendNotification(me, resultsMessage(damage));
    }
}

// TaleSpire will call this after a die roll because of our manifest
async function handleRollResult(rollEvent) {
    if (trackedIds[rollEvent.payload.rollId] == undefined) {
        // If we haven't tracked that roll, ignore it because it's not from us
        return;
    }

    if (debug) console.log("roll event", rollEvent);
    let results;
    // Get the results groups from the roll event
    const resultsGroups = rollEvent.payload.resultsGroups;
    // Process each results group
    for (let group of resultsGroups) {
        // Get the roll results from the group
        if (trackedIds[rollEvent.payload.rollId] == 2) {
            results = group.result.operands[0].results;
            damage = group.result.operands[1].value;
        } else {
            damage = 0;
            results = group.result.results;
        }

        // Add the results to allResults
        allResults = allResults.concat(results);
    }

    // After processing the roll event, remove its rollId from trackedIds
    delete trackedIds[rollEvent.payload.rollId];

    // Only update the HTML after all rolls are done
    if (Object.values(trackedIds).every(value => value === 1)) {

        // Now update the results
        updateResults(allResults, damage, targetValue, true);
        allResults = [];
    }
}

// Makes the message for the Total Results
function resultsMessage(damage) {
    totalSuccesses = countIcon + 2 * countExalted + damage
    if (countCrit != 0) {
        crit = "yes";
        colorCrit = `<color="red">`;
    } else {
        crit = "no"
        colorCrit = `<color="white">`;
    }
    if (countComplication != 0) {
        compl = "yes";
        colorCompl = `<color="red">`;
    } else {
        compl = "no"
        colorCompl = `<color="white">`;
    }
    let wrathText = `<size=120%><color="orange">Results<size=100%><color="white">
<b>Icons :</b>  ${countIcon}
<b>Exalted Icons :</b>  ${countExalted}
<b>Total successes :</b> ${totalSuccesses}
\n<color="orange"><b>WRATH DICE</b><color="white">
<b>Complications :</b>${colorCompl}${compl}<color="white">
<b>Critical Wrath :</b>${colorCrit}${crit}<color="white">`

    let normalText = `<size=120%><color="orange">Results<size=100%><color="white">
<b>Icons :</b>  ${countIcon}
<b>Exalted Icons :</b>  ${countExalted}
<b>Total successes :</b> ${totalSuccesses}`;

    let damageText = `<size=120%><color="orange">Results<size=100%><color="white">
<b>Icons :</b>  ${countIcon}
<b>Exalted Icons :</b>  ${countExalted}
<b>Damages :</b> ${totalSuccesses}`;
    if (damage !== 0) {
        damage = 0;
        return damageText;
    } else if (wrath.checked === true) {
        return wrathText;
    } else {
        return normalText
    }
}

