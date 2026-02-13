const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

let users = {};

const rolePower = {
    owner: 4,
    admin: 3,
    mod: 2,
    user: 1
};

io.on("connection", (socket) => {

    console.log("New connection:", socket.id);

    socket.on("set username", (username) => {

        let role = username === "Beluga" ? "owner" : "user";

        users[socket.id] = {
            name: username,
            role: role
        };

        socket.join("global");
        socket.currentRoom = "global";

        socket.emit("room joined", "global");

        io.to("global").emit(
            "chat message",
            `[SYSTEM] ${username} joined as ${role.toUpperCase()}`
        );

        console.log(username + " joined as " + role);
    });

    socket.on("join room", (room) => {

        socket.leave(socket.currentRoom);
        socket.join(room);
        socket.currentRoom = room;

        socket.emit("room joined", room);

        console.log(users[socket.id]?.name + " joined room " + room);
    });

    socket.on("chat message", (msg) => {

        const user = users[socket.id];
        if (!user) return;

        const room = socket.currentRoom || "global";

        // ---------------- COMMANDS ----------------
        if (msg.startsWith("$")) {

            const parts = msg.split(" ");
            const command = parts[0];

            // MAKE ROLE
            if (command === "$make" && parts.length >= 3) {

                const newRole = parts[1];
                const targetName = parts[2].replace("@", "");

                if (!rolePower[newRole]) return;

                if (rolePower[user.role] <= rolePower[newRole]) {
                    socket.emit("chat message", "[SYSTEM] Cannot assign equal/higher role");
                    return;
                }

                for (let id in users) {
                    if (users[id].name === targetName) {
                        users[id].role = newRole;
                        io.to(room).emit(
                            "chat message",
                            `[SYSTEM] ${targetName} is now ${newRole.toUpperCase()}`
                        );
                        console.log(targetName + " promoted to " + newRole);
                        return;
                    }
                }
            }

            // KICK
            if (command === "$kick" && parts.length >= 2) {

                const targetName = parts[1].replace("@", "");

                for (let id in users) {
                    if (users[id].name === targetName) {

                        if (rolePower[user.role] <= rolePower[users[id].role]) {
                            socket.emit("chat message", "[SYSTEM] Cannot kick equal/higher role");
                            return;
                        }

                        io.to(id).emit("chat message", "[SYSTEM] You were kicked");
                        io.sockets.sockets.get(id)?.disconnect();

                        console.log(targetName + " was kicked");
                        return;
                    }
                }
            }

            // CLEAR
            if (command === "$clear") {

                if (rolePower[user.role] >= rolePower.admin) {
                    io.to(room).emit("clear chat");
                    console.log("Chat cleared in room " + room);
                } else {
                    socket.emit("chat message", "[SYSTEM] Only admin+ can clear");
                }

                return;
            }

            // TRANSFER OWNER
            if (command === "$transfer" && parts.length >= 2) {

                if (user.role !== "owner") {
                    socket.emit("chat message", "[SYSTEM] Only owner can transfer");
                    return;
                }

                const targetName = parts[1].replace("@", "");

                for (let id in users) {
                    if (users[id].name === targetName) {

                        users[id].role = "owner";
                        user.role = "admin";

                        io.to(room).emit(
                            "chat message",
                            `[SYSTEM] Ownership transferred to ${targetName}`
                        );

                        console.log("Ownership transferred to " + targetName);
                        return;
                    }
                }
            }

            return;
        }

        // ---------------- NORMAL MESSAGE ----------------

        const formatted = `[${user.role.toUpperCase()}] ${user.name}: ${msg}`;

        io.to(room).emit("chat message", formatted);

        console.log("LOG:", formatted);
    });

    socket.on("disconnect", () => {

        if (users[socket.id]) {
            console.log(users[socket.id].name + " disconnected");
            delete users[socket.id];
        }
    });

});

const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});
