const fs = require("fs");
const http = require("request-promise");

const cardDefinitionsFileName = "./cards.js";
const cardImagesFileName = "./card-images.txt";
const oracleFileName = "./oracle.json";
const cacheOracleJson = false;
const createCardImages = false;

(async () => {
    const allCards = await loadAllCards();
    console.log(`loaded ${allCards.length} cards`);

    const filteredCards = filterCards(allCards);
    console.log(`filtered ${filteredCards.length} cards`);

    const groupedCards = groupCards(filteredCards);
    console.log(`grouped ${groupedCards.length} cards`);

    const mappedCards = mapCards(groupedCards);
    console.log(`mapped ${mappedCards.length} cards`);

    const sortedCards = sortCards(mappedCards);
    console.log(`sorted ${sortedCards.length} cards`);

    const cardDefinitionsfileContents = createFileContents(sortedCards);
    fs.writeFileSync(`${cardDefinitionsFileName}`, cardDefinitionsfileContents);
    console.log(`${cardDefinitionsFileName} created`);

    if (createCardImages) {
        const cardImagesFileContents = createCardImageFileContents(sortedCards);
        fs.writeFileSync(`${cardImagesFileName}`, cardImagesFileContents);
        console.log(`${cardImagesFileName} created`);
    }
})().catch(error => {
    console.log(error);
});

async function loadAllCards() {
    if (cacheOracleJson && fs.existsSync(oracleFileName)) {
        return JSON.parse(fs.readFileSync(oracleFileName))
    }

    const response = await http.get({ 
        uri: "https://api.scryfall.com/bulk-data", 
        headers: { 
            "User-Agent": "bejbej/mtgcards", 
            "Accept": "application/json;q=0.9,*/*;q=0.8" 
        } 
    }) 
    const cardSources = JSON.parse(response); 
    const oracleCardSource = cardSources.data.filter(cardSource => cardSource.type === "default_cards")[0];
    const oracleFileContents = await http.get(oracleCardSource.download_uri)

    if (cacheOracleJson) {
        fs.writeFileSync(oracleFileName, oracleFileContents);
    }

    return JSON.parse(oracleFileContents);
}

function filterCards(cards) {
    const isCard = card => card.object === "card";
    const isAllowedType = card => {
        try {
            determinePrimaryType(card);
            return true;
        }
        catch {
            return false;
        }
    }
    const isNotToken = card => !card.layout.includes("token");

    const isPaper = card => (card.games ?? []).indexOf("paper") > -1;

    const filters = [
        isCard,
        isAllowedType,
        isNotToken,
        isPaper
    ];

    return filters.reduce((cards, filter) => {
        return cards.filter(filter);
    }, cards);
}

function groupCards(cards) {
    const cardDictionary = cards.reduce((dictionary, card) => {
        dictionary[card.name] = dictionary[card.name] ?? [];
        dictionary[card.name].push(card);
        return dictionary;
    }, {});

    return Object.keys(cardDictionary).map(key => cardDictionary[key]);
}

function mapCards(groups) {
    return groups.map(cards => {
        const card = choosePrinting(cards);

        return {
            name: determineName(card),
            color: determineColor(card),
            type: determinePrimaryType(card),
            cmc: card.cmc,
            doubleFace: determineDoubleFace(card),
            imageUri: determineImageUri(card),
            price: determinePrice(cards)
        };
    });
}

function choosePrinting(cards) {
    if (cards.length === 1) {
        return cards[0];
    }

    const dictionary = cards.reduce((dictionary, card) => {
        const desirability = determinePrintingDesirability(card);
        dictionary[desirability] = dictionary[desirability] ?? [];
        dictionary[desirability].push(card);
        return dictionary;
    }, {});

    const desiredPrintings = dictionary[Math.max(...Object.keys(dictionary))];
    const orderedDesiredPrintings = desiredPrintings.slice().sort((a, b) => a.released_at < b.released_at ? 1 : -1);
    return orderedDesiredPrintings[0];
}

function determinePrintingDesirability(card) {
    // earlier items are more important
    const orderedCriteria = [
        card.id === "cc3db531-3f21-49a2-8aeb-d98b7db94397", // Plains
        card.id === "91595b00-6233-48be-a012-1e87bd704aca", // Island
        card.id === "8e5eef83-a3d4-44c7-a6cb-7f6803825b9e", // Swamp
        card.id === "6418bc71-de29-410c-baf3-f63f5615eee2", // Mountain
        card.id === "146b803f-0455-497b-8362-03da2547070d", // Forest
        
        // Readability
        card.lang != "en",
        card.textless === true,

        // Reprint only sets with promo mark
        card.set === "30a",
        card.set === "plst",
        card.set === "olep",
        card.set === "sld",
        card.set_type === "memorabilia",

        // Off theme
        card.security_stamp === "triangle",

        // Non-standard border
        (card.promo_types ?? []).length > 0,

        (card.frame_effects ?? []).indexOf("inverted") > -1,
        (card.frame_effects ?? []).indexOf("showcase") > -1,
        
        card.set_type === "masterpiece",
        card.full_art === true,
        card.border_color !== "black",
        (card.finishes ?? []).indexOf("nonfoil") === -1,

        card.image_status !== "highres_scan",

        // Old border
        card.frame === "future",
        card.frame === "1993",
        card.frame === "1997",
        card.frame === "2003",
        card.frame === "2015"
    ];

    let desirability = 0;
    for (let i = 0; i < orderedCriteria.length; ++i) {
        desirability = (desirability + (orderedCriteria[i] ? 0 : 1)) << 1;
    }

    return desirability;
}

function sortCards(cards) {
    return cards.sort((a, b) => a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1);
}

function createFileContents(cards) {
    const lines = cards.map(card => {
        return `${card.name}\t${card.type}\t${card.cmc}\t${card.color}\t${card.doubleFace}\t${card.price}\t${card.imageUri}`;
    });
    return `var cardsCSV = \`name\tprimaryType\tcmc\tcolor\tdoubleFace\tprice\timageUri\n${lines.join("\n")}\``;
}

function createCardImageFileContents(cards) {
    return cards.map(card => `${card.name}\t${card.imageUri}`).join("\n");
}

function determineName(card) {
    const layouts = [
        "transform",
        "flip"
    ];

    const name = layouts.includes(card.layout) ? card.card_faces["0"].name : card.name;
    return name
        .replace("É", "E")
        .replace("ó", "o");
}

function determineColor(card) {
    const colorMapping = {
        "W": "white",
        "U": "blue",
        "B": "black",
        "R": "red",
        "G": "green"
    }

    const layouts = [
        "modal_dfc",
        "transform"
    ];

    const primaryFace = layouts.includes(card.layout) ? card.card_faces["0"] : card;

    switch (primaryFace.colors.length) {
        case 0:
            return "colorless"
        case 1:
            return colorMapping[primaryFace.colors[0]];
        default:
            return "multicolored";
    }
}

function determinePrimaryType(card) {
    const typeMapping = {
        "creature": "creature",
        "summon": "creature",
        "autobot character": "creature",
        "eaturecray": "creature",
        "land": "land",
        "artifact": "artifact",
        "enchantment": "enchantment",
        "planeswalker": "planeswalker",
        "instant": "instant",
        "sorcery": "sorcery",
        "battle": "battle",
        "conspiracy": "conspiracy",
        "contraption": "contraption",
        "attraction": "attraction"
    }

    const layouts = [
        "split",
        "modal_dfc",
        "transform"
    ];

    if (card.layout.includes("token")) {
        throw `${card.name} is a token`;
    }

    const typeLine = layouts.includes(card.layout) ? card.card_faces["0"].type_line : card.type_line;
    const typeKeys = Object.keys(typeMapping);
    for (let i = 0; i < typeKeys.length; ++i) {
        const typeKey = typeKeys[i];
        if (typeLine.toLowerCase().includes(typeKey)) {
            return typeMapping[typeKey];
        }
    }

    throw `Can't determine the primary type for ${card.name}`;
}

function determineImageUri(card) {
    switch (card.name) {
        case "Plains":
            return "cc3db531-3f21-49a2-8aeb-d98b7db94397";
        case "Island":
            return "91595b00-6233-48be-a012-1e87bd704aca";
        case "Swamp":
            return "8e5eef83-a3d4-44c7-a6cb-7f6803825b9e";
        case "Mountain":
            return "6418bc71-de29-410c-baf3-f63f5615eee2";
        case "Forest":
            return "146b803f-0455-497b-8362-03da2547070d";
    }

    const layouts = [
        "modal_dfc",
        "transform"
    ];

    const primaryFace = layouts.includes(card.layout) ? card.card_faces["0"] : card;
    const result = /front\/.\/.\/([^\.]+)\.jpg/.exec(primaryFace.image_uris.border_crop);
    if (result === null) {
        return "";
    }

    const [, imageUri] = result;
    return imageUri;
}

function determineDoubleFace(card) {
    const layouts = [
        "modal_dfc",
        "transform"
    ];

    return layouts.includes(card.layout) ? "1" : "0";
}

function determinePrice(cards) {
    const allPrices = cards.map(card => [card.prices.usd, card.prices.usd_etched, card.prices.usd_foil])
        .flat(1)
        .filter(x => x !== null);

    return allPrices.length === 0 ? 0 : Math.min(...allPrices);
}
