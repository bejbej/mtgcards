const fs = require("fs");
const http = require("request-promise");

const cardDefinitionsFileName = "./cards.js";

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

    const fileContents = createFileContents(sortedCards);
    console.log("created file contents");

    fs.writeFileSync(`${cardDefinitionsFileName}`, fileContents);
    console.log(`${cardDefinitionsFileName} created`);
})().catch(error => {
    console.log(error);
});

async function loadAllCards() {
    const response = await http.get({ 
        uri: "https://api.scryfall.com/bulk-data", 
        headers: { 
            "User-Agent": "bejbej/mtgcards", 
            "Accept": "application/json;q=0.9,*/*;q=0.8" 
        } 
    }) 
    const cardSources = JSON.parse(response); 
    const oracleCardSource = cardSources.data.filter(cardSource => cardSource.type === "default_cards")[0];
    return JSON.parse(await http.get(oracleCardSource.download_uri));
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

    const filters = [
        isCard,
        isAllowedType,
        isNotToken
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
    if (card.textless === true) {
        return 1;
    }

    if (card.digital) {
        return 2;
    }

    if (card.security_stamp === "triangle") {
        return 3;
    }

    if ((card.promo_types ?? []).indexOf("boosterfun") > -1) {
        return 4;
    }

    if ((card.frame_effects ?? []).indexOf("inverted") > -1) {
        return 5;
    }

    if (card.set_type === "masterpiece") {
        return 6;
    }

    if (card.full_art === true) {
        return 7;
    }

    if (card.nonfoil === false) {
        return 8;
    }

    if (card.border_color === "borderless") {
        return 9;
    }

    if (card.border_color !== "black") {
        return 10;
    }

    if (card.set_type === "memorabilia") {
        return 11;
    }

    if (card.set === "plst") {
        return 12;
    }

    if (card.set === "sld") {
        return 13;
    }

    if (card.frame === "future") {
        return 14;
    }

    if (card.frame === "1997") {
        return 15;
    }

    return Number.POSITIVE_INFINITY;
}

function sortCards(cards) {
    return cards.sort((a, b) => a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1);
}

function createFileContents(cards) {
    const lines = cards.map(card => {
        return `${card.name}\t${card.type}\t${card.cmc}\t${card.color}\t${card.price}\t${card.imageUri}`;
    });
    return `var cardsCSV = \`name	primaryType	cmc	color	price   imageuri	doubleFace\n${lines.join("\n")}\``;
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
            return "c/c/cc3db531-3f21-49a2-8aeb-d98b7db94397";
        case "Island":
            return "9/1/91595b00-6233-48be-a012-1e87bd704aca";
        case "Swamp":
            return "8/e/8e5eef83-a3d4-44c7-a6cb-7f6803825b9e";
        case "Mountain":
            return "6/4/6418bc71-de29-410c-baf3-f63f5615eee2";
        case "Forest":
            return "1/4/146b803f-0455-497b-8362-03da2547070d";
    }

    const layouts = [
        "modal_dfc",
        "transform"
    ];

    const primaryFace = layouts.includes(card.layout) ? card.card_faces["0"] : card;
    const result = /front\/([^\.]+)\.jpg/.exec(primaryFace.image_uris.border_crop);
    if (result === null) {
        return "";
    }

    const [, imageUri] = result;
    const doubleFace = layouts.includes(card.layout) ? "\t1" : "";
    
    return `${imageUri}${doubleFace}`;
}

function determinePrice(cards) {
    const allPrices = cards.map(card => [card.prices.usd, card.prices.usd_etched, card.prices.usd_foil])
        .flat(1)
        .filter(x => x !== null);

    return allPrices.length === 0 ? 0 : Math.min(...allPrices);
}
