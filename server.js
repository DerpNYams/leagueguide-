const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const path = require("path");
const { readData, writeData, makeId } = require("./lib/store");

const app = express();
const PORT = process.env.PORT || 3000;
const adminEmail = process.env.ADMIN_EMAIL || "admin@leagueguide.com";
const adminPassword = process.env.ADMIN_PASSWORD || "ChangeMe123!";
const adminPasswordHash = bcrypt.hashSync(adminPassword, 10);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "local-development-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 2 }
  })
);

app.use((req, res, next) => {
  res.locals.isAdmin = Boolean(req.session.isAdmin);
  res.locals.notice = req.session.notice || null;
  delete req.session.notice;
  next();
});

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.redirect("/login");
  next();
}

function cleanPost(body) {
  return {
    title: String(body.title || "").trim(),
    date: String(body.date || "").trim(),
    category: String(body.category || "").trim(),
    summary: String(body.summary || "").trim(),
    location: String(body.location || "").trim(),
    published: body.published === "on"
  };
}

app.get("/", (req, res) => {
  const posts = readData().posts
    .filter((post) => post.published)
    .sort((a, b) => a.date.localeCompare(b.date));
  res.render("index", { title: "League Guide", posts });
});

app.get("/events/:id", (req, res) => {
  const post = readData().posts.find(
    (item) => item.id === req.params.id && (item.published || req.session.isAdmin)
  );
  if (!post) return res.status(404).render("404", { title: "Guide Not Found" });
  res.render("event", { title: post.title, post });
});

app.get("/contact", (req, res) => res.render("contact", { title: "Contact Us" }));

app.post("/contact", (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim();
  const message = String(req.body.message || "").trim();
  if (!name || !email || !message) {
    req.session.notice = "Please complete every contact field.";
    return res.redirect("/contact");
  }
  const data = readData();
  data.messages.push({ id: Date.now().toString(36), name, email, message, createdAt: new Date().toISOString() });
  writeData(data);
  req.session.notice = "Your message was sent. We will get back to you soon.";
  res.redirect("/contact");
});

app.get("/login", (req, res) => res.render("login", { title: "Admin Login" }));

app.post("/login", (req, res) => {
  const emailMatches = String(req.body.email || "").toLowerCase() === adminEmail.toLowerCase();
  const passwordMatches = bcrypt.compareSync(String(req.body.password || ""), adminPasswordHash);
  if (!emailMatches || !passwordMatches) {
    req.session.notice = "Incorrect email or password.";
    return res.redirect("/login");
  }
  req.session.regenerate((error) => {
    if (error) return res.status(500).send("Could not start a session.");
    req.session.isAdmin = true;
    res.redirect("/admin");
  });
});

app.post("/logout", (req, res) => req.session.destroy(() => res.redirect("/")));

app.get("/admin", requireAdmin, (req, res) => {
  const data = readData();
  res.render("admin", { title: "Admin Dashboard", posts: data.posts, messages: data.messages });
});

app.get("/admin/events/new", requireAdmin, (req, res) => {
  res.render("event-form", { title: "Add Event", post: null, formAction: "/admin/events" });
});

app.post("/admin/events", requireAdmin, (req, res) => {
  const post = cleanPost(req.body);
  if (!post.title || !post.date || !post.summary) {
    req.session.notice = "Title, date, and description are required.";
    return res.redirect("/admin/events/new");
  }
  const data = readData();
  data.posts.push({ id: makeId(post.title), ...post });
  writeData(data);
  req.session.notice = "Guide added.";
  res.redirect("/admin");
});

app.get("/admin/events/:id/edit", requireAdmin, (req, res) => {
  const post = readData().posts.find((item) => item.id === req.params.id);
  if (!post) return res.status(404).render("404", { title: "Guide Not Found" });
  res.render("event-form", { title: "Edit Event", post, formAction: `/admin/events/${post.id}` });
});

app.post("/admin/events/:id", requireAdmin, (req, res) => {
  const data = readData();
  const index = data.posts.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).render("404", { title: "Guide Not Found" });
  const update = cleanPost(req.body);
  if (!update.title || !update.date || !update.summary) {
    req.session.notice = "Title, date, and description are required.";
    return res.redirect(`/admin/events/${req.params.id}/edit`);
  }
  data.posts[index] = { ...data.posts[index], ...update };
  writeData(data);
  req.session.notice = "Guide updated.";
  res.redirect("/admin");
});

app.post("/admin/events/:id/delete", requireAdmin, (req, res) => {
  const data = readData();
  data.posts = data.posts.filter((item) => item.id !== req.params.id);
  writeData(data);
  req.session.notice = "Guide deleted.";
  res.redirect("/admin");
});

app.use((req, res) => res.status(404).render("404", { title: "Page Not Found" }));

if (require.main === module) {
  app.listen(PORT, () => console.log(`League Guide running at http://localhost:${PORT}`));
}

module.exports = app;
