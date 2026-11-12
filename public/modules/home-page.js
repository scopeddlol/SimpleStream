export function initHome() {
  const $ = (selector) => document.querySelector(selector);
  let name = "",
    progress = [];
  try {
    name = localStorage.getItem("simplestream:name") || "";
    progress = JSON.parse(localStorage.getItem("simplestream:setup") || "[]");
    if (!Array.isArray(progress)) progress = [];
  } catch {}
  function render() {
    $("#welcome-title").textContent = `Welcome home, ${name || "creator"}.`;
    $("#display-name").value = name;
    const count = ["avatar", "hub", "output"].filter((key) =>
      progress.includes(key),
    ).length;
    $("#setup-count").textContent = `${count} / 3`;
    $("#setup-bar").style.width = `${(count / 3) * 100}%`;
    document.querySelectorAll("[data-step]").forEach((item, index) => {
      item.classList.toggle("complete", progress.includes(item.dataset.step));
      item.querySelector(".step-check").textContent = progress.includes(
        item.dataset.step,
      )
        ? "✓"
        : index + 1;
    });
  }
  $("#home-date").textContent =
    new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
      .format(new Date())
      .toUpperCase() + " · YOUR SPACE TO CREATE";
  document.addEventListener("setup-progress", (event) => {
    if (!progress.includes(event.detail)) {
      progress.push(event.detail);
      localStorage.setItem("simplestream:setup", JSON.stringify(progress));
      render();
    }
  });
  $("#profile").onclick = () => $("#profile-dialog").showModal();
  $("#profile-form").onsubmit = (event) => {
    event.preventDefault();
    name = $("#display-name").value.trim();
    localStorage.setItem("simplestream:name", name);
    render();
    $("#profile-dialog").close();
  };
  let step = 0;
  const steps = [
    {
      icon: "⌂",
      title: "A place that feels like you.",
      text: "Home is your landing spot: a welcome, your setup progress, and a place for past-stream insights when your accounts are connected.",
      page: "home",
    },
    {
      icon: "✦",
      title: "Meet your on-screen self.",
      text: "Pick a look, fit its eyes and mouth, try an expression, and turn on local face tracking. Your avatar keeps running when you move between pages.",
      page: "avatar",
    },
    {
      icon: "▦",
      title: "Build your own control room.",
      text: "Stream Hub brings your community together. Use New page to build a custom grid with avatar previews, chat, alerts, viewers, and browser docks. Edit layout to move and resize each element.",
      page: "hub",
    },
  ];
  function tour() {
    const item = steps[step];
    $("#tour-step").textContent = `A LITTLE TOUR · ${step + 1} OF 3`;
    $("#tour-icon").textContent = item.icon;
    $("#tour-title").textContent = item.title;
    $("#tour-description").textContent = item.text;
    $("#tour-next").textContent = step === 2 ? "Make it mine" : "Next →";
    location.hash = item.page;
  }
  $("#open-tour").onclick = () => {
    step = 0;
    tour();
    $("#tour-dialog").showModal();
  };
  $("#tour-next").onclick = () => {
    if (step === 2) {
      $("#tour-dialog").close();
      localStorage.setItem("simplestream:tour", "done");
      location.hash = "home";
    } else {
      step++;
      tour();
    }
  };
  $("#tour-skip").onclick = () => {
    $("#tour-dialog").close();
    location.hash = "home";
  };
  render();
}
