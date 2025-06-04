const hamburger = document.querySelector(".hamburger");
const menu = document.querySelector(".menu");

hamburger.addEventListener("click", () => {
    hamburger.classList.toggle("active");
    menu.classList.toggle("active");
});

document.querySelectorAll(".menu-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
        hamburger.classList.remove("active");
        menu.classList.remove("active");
    })
);