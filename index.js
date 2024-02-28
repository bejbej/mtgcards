const fs = require("fs");
const http = require("request-promise");

const cardDefinitionsFileName = "./cards.js";

(async () => {
    const allCards = await loadAllCards();
    console.log(`loaded ${allCards.length} cards`);

    const filteredCards = filterCards(allCards);
    console.log(`filtered ${filteredCards.length} cards`);

    const mappedCards = mapCards(filteredCards);
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
    const cardSources = JSON.parse(await http.get("https://api.scryfall.com/bulk-data"));
    const oracleCardSource = cardSources.data.filter(cardSource => cardSource.type === "oracle_cards")[0];
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

function mapCards(cards) {
    return cards.map(card => {
        return {
            name: determineName(card),
            color: determineColor(card),
            type: determinePrimaryType(card),
            cmc: card.cmc,
            imageUri: determineImageUri(card)
        };
    });
}

function sortCards(cards) {
    return cards.sort((a, b) => a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1);
}

function createFileContents(cards) {
    const lines = cards.map(card => {
        return `${card.name}\t${card.type}\t${card.cmc}\t${card.color}\t${card.imageUri}`;
    });
    return `var cardsCSV = \`name	primaryType	cmc	color	imageuri	doubleFace\n${lines.join("\n")}\``;
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
    const [, imageUri ] = /front\/([^\.]+)\.jpg/.exec(primaryFace.image_uris.border_crop);
    const doubleFace = layouts.includes(card.layout) ? "\t1" : "";

    return `${imageUri}${doubleFace}`;
}
