import React, { useState } from "react";
import {
	FieldGroup,
	Button,
	TextField,
	Pill,
} from "@contentful/forma-36-react-components";

export default ({ sdk }) => {
	const [formOpen, setFormOpen] = useState(false);
	const [key, setKey] = useState("");
	const [value, setValue] = useState("");
	// this is only used to trigger a re-render after deleting an item
	const [render, setRender] = useState(null);

	const closeForm = () => {
		setFormOpen(false);
		setKey("");
		setValue("");
	};

	const fieldValue = sdk.field.getValue() || [];
	return (
		<FieldGroup>
			{fieldValue &&
				fieldValue.map((item, index) => {
					return (
						<Pill
							key={index}
							label={`${item.key || ""}: ${item.value || ""}`}
							onClose={(e) => {
								const values = fieldValue;
								values.splice(index, 1);
								sdk.field.setValue(values);
								setRender({});
							}}
						/>
					);
				})}

			{formOpen && (
				<div>
					<TextField
						name="key"
						id="key"
						labelText="UTM name"
						width="medium"
						value={key}
						onChange={(e) => {
							setKey(e.target.value);
						}}
					/>
					<TextField
						name="value"
						id="value"
						labelText="UTM Value"
						width="medium"
						value={value}
						onChange={(e) => {
							setValue(e.target.value);
						}}
					/>

					<Button
						buttonType="positive"
						onClick={() => {
							const values = fieldValue;
							values.push({ key: key, value: value });
							sdk.field.setValue(values);
							closeForm();
						}}
					>
						Save
					</Button>
					<Button
						buttonType="warning"
						onClick={() => {
							closeForm();
						}}
					>
						Cancel
					</Button>
				</div>
			)}

			{!formOpen && (
				<Button
					buttonType="muted"
					onClick={() => {
						setFormOpen(true);
					}}
				>
					Add
				</Button>
			)}
		</FieldGroup>
	);
};
