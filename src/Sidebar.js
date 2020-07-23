import React, { useEffect, useState } from "react";
import {
	FieldGroup,
	CheckboxField,
	Button,
	ValidationMessage,
} from "@contentful/forma-36-react-components";

function Sidebar({ sdk }) {
	const [linksToUpdate, setLinksToUpdate] = useState([]);
	const [linkedEntries, setLinkedEntries] = useState([]);
	const [linkedContentTypes, setLinkedContentTypes] = useState({});
	const [selectAll, setSelectAll] = useState(false);
	const [validSelection, setValidSeclection] = useState(false);

	console.log(sdk);

	const getLinkedEntries = async () => {
		const entries = await sdk.space.getEntries({
			links_to_entry: sdk.entry.getSys().id,
		});
		//find titles for entries
		if (entries.total > 0) {
			const displayFields = {};

			//find the display field for each entry and add as a property
			const entriesWithTitle = await Promise.all(
				entries.items.map(async (entry) => {
					const contentTypeId = entry.sys.contentType.sys.id;
					// get the content-type if we don't already know
					// the displayField for this content-type
					if (!displayFields[contentTypeId]) {
						const responseEntry = await sdk.space.getContentType(
							contentTypeId
						);
						displayFields[contentTypeId] =
							responseEntry.displayField;

						// store the content type in state so later
						// we can update the link field
						const newContentTypes = { ...linkedContentTypes };
						newContentTypes[contentTypeId] = responseEntry;
						setLinkedContentTypes(newContentTypes);
					}
					// get the locale value for the display field and add to the entry
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

	const handlePublish = async () => {
		if (
			linksToUpdate.length > 0 &&
			linksToUpdate.length < linkedEntries.length
		) {
			//create a new entry with the current unpublished data
			const entryId = sdk.entry.getSys().id;
			const entry = await sdk.space.getEntry(entryId);
			const contentTypeId = entry.sys.contentType.sys.id;
			const unpublishedFields = entry.fields;

			// TODO: edit title field to relate to this entry
			const newEntryDraft = await sdk.space.createEntry(contentTypeId, {
				fields: { ...unpublishedFields },
			});

			//publish new entry
			const newEntry = await sdk.space.publishEntry(newEntryDraft);

			//link each entry to update with the new entry
			linksToUpdate.forEach(async (linkedEntryId) => {
				const linkedEntry = linkedEntries.filter(
					(link) => link.sys.id === linkedEntryId
				)[0];

				const newFields = { ...linkedEntry.fields };

				// find the field that links to this entry
				// and replace it with a link to newEntry

				Object.keys(linkedEntry.fields).forEach((key) => {
					const field = linkedEntry.fields[key];
					// loop through the locales for each field
					Object.keys(field).forEach((locale) => {
						const fieldLocale = field[locale];
						// check if field is an array
						if (Array.isArray(fieldLocale)) {
							fieldLocale.forEach((item, index) => {
								//check if item is a link
								if (item.sys) {
									//check if this is the link we should replace
									if (item.sys.id === entryId) {
										newFields[key][locale][index].sys.id =
											newEntry.sys.id;
									}
								}
							});
						} else {
						}
					});
				});

				// update the linked entry
				const updatedLinkedEntry = await sdk.space.updateEntry({
					...linkedEntry,
					fields: newFields,
				});
				console.log("updated", updatedLinkedEntry);
			});

			//TODO: revert changes on current entry
			// console.log("orig", entry);
			// const snapshots = await sdk.space.getEntrySnapshots(entryId);
			// console.log("snapshots", snapshots);
		} else {
			// if the user selected all the linked entries then we can
			// leave the existing links and update as normal
		}
	};

	useEffect(() => {
		setValidSeclection(
			linkedEntries.length <= 0 ||
				(linkedEntries.length > 0 && linksToUpdate.length > 0)
		);
	}, [linkedEntries, linksToUpdate]);

	//find all the entries that link to this entry
	useEffect(() => {
		getLinkedEntries();
	}, []);

	//keep `select all` in sync
	useEffect(() => {
		if (
			linksToUpdate.length > 0 &&
			linksToUpdate.length === linkedEntries.length
		) {
			setSelectAll(true);
		} else {
			setSelectAll(false);
		}
	}, [linksToUpdate]);

	let result = (
		<div>
			<h1>All clear.</h1>
		</div>
	);

	if (linkedEntries.length > 0) {
		result = (
			<div>
				<h1>Warning:</h1>
				<h5>This entry is used in more than one place</h5>

				<FieldGroup>
					<CheckboxField
						key={"all"}
						labelText={"Select all"}
						name={"all"}
						id={"all"}
						checked={selectAll}
						onChange={(e) => {
							if (e.target.checked) {
								setLinksToUpdate(
									linkedEntries.map((entry) => entry.sys.id)
								);
								setSelectAll(true);
							} else {
								setSelectAll(false);
								setLinksToUpdate([]);
							}
						}}
					/>
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
				</FieldGroup>
				{!validSelection ? (
					<ValidationMessage>
						Select the places you inted to be affected by updating
						this entry
					</ValidationMessage>
				) : null}
			</div>
		);
	}

	return (
		<div>
			{result}

			<Button
				buttonType="positive"
				onClick={() => {
					handlePublish();
				}}
				disabled={!validSelection}
			>
				Publish
			</Button>
		</div>
	);
}
export default Sidebar;
