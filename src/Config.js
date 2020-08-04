import React, { Component } from "react";
import { Heading, Note, Form } from "@contentful/forma-36-react-components";

export default class Config extends Component {
	constructor(props) {
		super(props);
		this.state = { parameters: {} };
		this.app = this.props.sdk.app;
		this.app.onConfigure(() => this.onConfigure());
	}

	async componentDidMount() {
		const parameters = await this.app.getParameters();
		this.setState({ parameters: parameters || {} }, () =>
			this.app.setReady()
		);
	}

	render() {
		return (
			<Form id="app-config">
				<Heading>Dado AA app</Heading>
				<Note noteType="primary" title="About the app">
					Make editors in this space a little bit happier with some
					customized editor functionality
				</Note>
			</Form>
		);
	}

	async onConfigure() {
		const {
			items: contentTypes,
		} = await this.props.sdk.space.getContentTypes();
		const contentTypeIds = contentTypes.map((ct) => ct.sys.id);

		const result = {
			parameters: this.state.parameters,
			targetState: {
				EditorInterface: contentTypeIds.reduce((acc, id) => {
					return { ...acc, [id]: { sidebar: { position: 0 } } };
				}, {}),
			},
		};

		console.log("got result", result);
		return result;
	}
}
