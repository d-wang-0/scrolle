import { mount } from "svelte";
import App from "./shell/App.svelte";
import "./shell/app.css";
import "./shell/ui-style.js";

mount(App, { target: document.getElementById("app")! });
