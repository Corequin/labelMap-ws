interface IUser {
  username: string;
  posX: number;
  posY: number;
  visitedCountries: string[];
  lastHeartbeat?: number;
}

interface Message {
  sender: string;
  recipient: string;
  text: string;
  timestamp: number;
}

const username = [
    'Lynx philosophe',
    'Kangourou turbulant',
    'Gorille végétarien',
    'Chat sprinteur',
    'Tortue timide',
    'Aligator mignon',
    'Aigle myope',
    'Éléphant acrobate',
    'Chameau surfeur',
    'Hibou bavard'
];
const users : IUser[] = [];

const CLEANUP_INTERVAL = 15000;
const HEARTBEAT_TIMEOUT = 10000;

function cleanInactiveUsers(server: any) {
    const now = Date.now();
    const inactiveUsers = users.filter(user => now - (user.lastHeartbeat || 0) > HEARTBEAT_TIMEOUT);

    if (inactiveUsers.length > 0) {
        inactiveUsers.forEach(user => {
            const index = users.findIndex(u => u.username === user.username);
            if (index !== -1) {
                users.splice(index, 1);
                username.push(user.username);
            }
        });

        // Notify remaining users about disconnections
        if (users.length > 0) {
            server.publish("users", JSON.stringify({
                type: 'userDisconnected',
                users: users
            }));
        }
    }
}

const server = Bun.serve<{ id: string }>({
    port: process.env.PORT || 4000,
    fetch(req, server) {
        // Add CORS headers to allow connections from any origin
        if (req.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                }
            });
        }

        username.sort(() => Math.random() - 0.5);
        if (server.upgrade(req, {
            data: { username: username.shift() }
        })) {
            return;
        }
        return new Response('Upgrade failed', { status: 500 });
    },
    websocket: {
        open(ws) {
            ws.send(JSON.stringify({
                type: 'init',
                username: ws.data.username,
                users: users
            }));
            ws.subscribe("users");
            ws.subscribe(`chat-${ws.data.username}`);
            users.push({
                username: ws.data.username,
                posX: 0,
                posY: 0,
                visitedCountries: [],
                lastHeartbeat: Date.now()
            });
        },
        message(ws, receivedData) {
            const data = JSON.parse(receivedData);
            const userIndex = users.findIndex(user => user.username === ws.data.username);
            if (userIndex !== -1) {
                users[userIndex].lastHeartbeat = Date.now();
            }
            if(data.type === "heartbeat") {
                ws.send(JSON.stringify({ type: "heartbeat_ack" }));
                return;
            }
            else if(data.type === "position") {
                const index = users.findIndex(user => user.username === ws.data.username);
                users[index] = {...users[index], posX: data.posX, posY: data.posY};
                server.publish("users", JSON.stringify(users[index]));
            }
            else if(data.type === "visitedCountry") {
                const index = users.findIndex(user => user.username === ws.data.username);
                users[index].visitedCountries = [...data.countries];
            }
            else if(data.type === "getCountries") {
                const index = users.findIndex(user => user.username === data.username);
                ws.send(JSON.stringify({
                    type: "getCountries",
                    username: data.username,
                    countries: users[index].visitedCountries
                }))
            }
            else if(data.type === 'chat') {
                console.log(data);
                const timestamp = Date.now();
                const chatMessage: Message = {
                    sender: ws.data.username,
                    recipient: data.recipientUsername,
                    text: data.message,
                    timestamp: timestamp
                };
                server.publish(`chat-${data.recipientUsername}`, JSON.stringify({
                    type: 'chat',
                    username: ws.data.username,
                    recipientUsername: data.recipientUsername,
                    message: data.message,
                    timestamp: timestamp
                }));
            }
        },
        close(ws) {
            const index = users.findIndex(user => user.username === ws.data.username);
            if (index !== -1) {
                users.splice(index, 1);
                server.publish("users", JSON.stringify({
                    type: 'userDisconnected',
                    users: users
                }));
                ws.unsubscribe("users");
                ws.unsubscribe(`chat-${ws.data.username}`);
                username.push(ws.data.username);
            }
        },
    }
});

setInterval(() => cleanInactiveUsers(server), CLEANUP_INTERVAL);
console.log(`WebSocket server running on ${process.env.PORT ? 'port ' + process.env.PORT : 'ws://localhost:4000'}`);