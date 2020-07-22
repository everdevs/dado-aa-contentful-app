import React from "react";
import { render } from "react-dom";
import "./index.css";
import { init, locations } from "contentful-ui-extensions-sdk";
import Sidebar from "./Sidebar";
import Config from "./Config";
init((sdk) => {
	const root = document.getElementById("root");
	console.log("init");

	if (sdk.location.is(locations.LOCATION_APP_CONFIG)) {
		render(<Config sdk={sdk} />, root);
	} else {
		render(<Sidebar sdk={sdk} />, root);
		sdk.window.startAutoResizer();
	}
});
