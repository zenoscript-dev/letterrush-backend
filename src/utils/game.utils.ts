import { v4 as uuidv4 } from 'uuid';
function generateRoomName() {
    const regions = [
        'Atlantis', 'Avalon', 'Eldorado', 'Shangri-La', 'Asgard',
        'Pandora', 'Narnia', 'Middle Earth', 'Aether', 'Aether'
    ];
    const randomRegion = regions[Math.floor(Math.random() * regions.length)];
    const randomId = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${randomRegion}-${randomId}`;
}

function generateUUID() {
    return uuidv4();
}

export { generateRoomName, generateUUID };