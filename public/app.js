let socket;
let token;
let currentChannel = "general";

async function register() {
  await fetch("/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: username.value,
      password: password.value
    })
  });
  alert("Registered");
}

async function login() {
  const res = await fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: username.value,
      password: password.value
    })
  });

  const data = await res.json();
  if (!data.token) return alert("Login failed");

  token = data.token;

  socket = io({
    auth: { token }
  });

  document.getElementById("auth").style.display = "none";
  document.getElementById("app").style.display = "block";

  socket.on("channels", list => {
    channels.innerHTML = list.map(c =>
      `<button onclick="joinChannel('${c}')">${c}</button>`
    ).join("");
  });

  socket.on("message", data => {
    if (data.channel === currentChannel) {
      messages.innerHTML += `<div><b>${data.user}</b>: ${data.text}</div>`;
    }
  });
}

function joinChannel(channel) {
  currentChannel = channel;
  socket.emit("joinChannel", channel);
  messages.innerHTML = "";
}

function send() {
  socket.emit("message", {
    channel: currentChannel,
    text: msg.value
  });
  msg.value = "";
}
