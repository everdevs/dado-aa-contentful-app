import React, { useEffect, useState } from "react";
import { CheckboxField } from "@contentful/forma-36-react-components";

function Sidebar({ sdk }) {
	const [linksToUpdate, setLinksToUpdate] = useState([]);
	const [linkedEntries, setLinkedEntries] = useState([]);

	const getLinkedEntries = async () => {
		const entries = await sdk.space.getEntries({
			links_to_entry: sdk.entry.getSys().id,
		});
		//find titles for entries
		if (entries.total > 0) {
			const displayFields = {};

			const entriesWithTitle = await Promise.all(
				entries.items.map(async (entry) => {
					const contentTypeId = entry.sys.contentType.sys.id;
					if (!displayFields[contentTypeId]) {
						const responseEntry = await sdk.space.getContentType(
							contentTypeId
						);
						displayFields[contentTypeId] =
							responseEntry.displayField;
					}
					const title = entry.fields[displayFields[contentTypeId]];
					const titleLocales = Object.keys(title);
					return {
						...entry,
						displayField: title[titleLocales[0]],
					};
				})
			);

			setLinkedEntries(entriesWithTitle);
		}
	};

	useEffect(() => {
		getLinkedEntries();
	}, [getLinkedEntries]);

	let result = (
		<div>
			<h1>All clear.</h1>
		</div>
	);

	if (linkedEntries.length > 0) {
		//add update listener to each field
		// Object.keys(sdk.entry.fields).forEach((key) => {
		// 	const field = sdk.entry.fields[key];
		// 	console.log("got field", field);
		// 	field.onValueChanged((value) => {
		// 		console.log("field " + key + " changed!!!");
		// 		console.log(value);
		// 	});
		// });

		result = (
			<div>
				<h1>Warning</h1>
				<h4>This entry is used in more than one place</h4>
				<h5>
					Select the places you inted to be affected by updating this
					entry
				</h5>
				{linkedEntries.map((entry, index) => {
					return (
						<CheckboxField
							key={entry.sys.id}
							labelText={entry.displayField}
							helpText={entry.sys.contentType.sys.id}
							name={entry.sys.id}
							id={entry.sys.id}
							checked={linksToUpdate.includes(entry.sys.id)}
							onChange={(e) => {
								if (e.target.checked) {
									setLinksToUpdate([
										...linksToUpdate,
										entry.sys.id,
									]);
								} else {
									setLinksToUpdate(
										linksToUpdate.filter(
											(id) => id !== entry.sys.id
										)
									);
								}
							}}
						/>
					);
				})}
			</div>
		);
	}
	console.log("linkedEntries: ", linkedEntries);
	return <div>{result}</div>;
}
export default Sidebar;
