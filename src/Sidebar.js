import React, { useEffect, useState } from "react";
import {
	FieldGroup,
	CheckboxField,
	Button,
	ValidationMessage,
	Paragraph,
	Icon,
	Spinner,
} from "@contentful/forma-36-react-components";
import relativeDate from "relative-date";

function Sidebar({ sdk }) {
	const [linksToUpdate, setLinksToUpdate] = useState([]);
	const [linkedEntries, setLinkedEntries] = useState([]);
	const [linkedContentTypes, setLinkedContentTypes] = useState({});
	const [selectAll, setSelectAll] = useState(false);
	const [validSelection, setValidSeclection] = useState(false);
	const [originalEntry, setOriginalEntry] = useState({});
	const [entryStatus, setEntryStatus] = useState({
		working: false,
		isDraft: false,
		hasPendingChanges: false,
		isPublished: false,
		lastPublish: null,
	});
	const [showSpinner, setShowSpinner] = useState(false);

	const entryId = sdk.entry.getSys().id;

	const doGetLinkedEntries = async () => {
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
		} else {
			setLinkedEntries([]);
		}
	};

	const handlePublish = async () => {
		setEntryStatus({ ...entryStatus, working: true });
		const entryId = sdk.entry.getSys().id;
		if (
			linksToUpdate.length > 0 &&
			linksToUpdate.length < linkedEntries.length
		) {
			setShowSpinner(true);

			// //duplicate this entry using the last published data
			const contentTypeId = originalEntry.sys.contentType.sys.id;

			// //create new entry draft
			const newEntryDraft = await sdk.space.createEntry(contentTypeId, {
				fields: { ...originalEntry.fields },
			});

			// // publish new entry
			const newEntry = await sdk.space.publishEntry(newEntryDraft);

			// save the changes made to this entry
			const updatedEntry = await sdk.space.getEntry(entryId);
			await sdk.space.publishEntry(updatedEntry);
			const tasks = [];
			// now we have the last published version of this entry as newEntry
			// for each page that is not included in the update list
			// replace the link to this entry with a link to the newEntry
			linkedEntries
				.filter((linkedEntry) => {
					return !linksToUpdate.includes(linkedEntry.sys.id);
				})
				.forEach(async (linkedEntry) => {
					// populate with all fields for default values
					// the required fields will be overwritten
					const newFields = { ...linkedEntry.fields };

					//find the field that links to this entry
					Object.keys(linkedEntry.fields).forEach((key) => {
						const field = linkedEntry.fields[key];
						Object.keys(field).forEach((locale) => {
							//check if this field can reference another entry
							if (isReferenceField(field)) {
								const fieldValue = field[locale];

								if (Array.isArray(fieldValue)) {
									//find link in list of links
									fieldValue.forEach((fv, index) => {
										if (
											fv.sys &&
											fv.sys.type === "Link" &&
											fv.sys.id === entryId
										) {
											console.log("found ref", fv);
											newFields[key][locale][
												index
											].sys.id = newEntry.sys.id;
										}
									});
								} else {
									//check if single link or rich text
									if (
										fieldValue.sys &&
										fieldValue.sys.type === "Link"
									) {
										//single link
										if (fieldValue.sys.id === entryId) {
											console.log("found ref!");
											newFields[key][locale].sys.id =
												newEntry.sys.id;
										}
									} else {
										//rich text
										const replaced = recursivelyReplaceLink(
											fieldValue,
											originalEntry.sys.id,
											newEntry.sys.id
										);
									}
								}
							}
						});
					});
					// update the linked entry
					const updatedLinkedEntry = {
						...linkedEntry,
						fields: newFields,
					};
					const updated = await sdk.space.updateEntry(
						updatedLinkedEntry
					);
					// publish the updated entry
					tasks.push(sdk.space.publishEntry(updated));
				});
			// wait untill all updates are finished then clean up
			try {
				await Promise.all(tasks);
				sdk.notifier.success("Entry updated");
				//TODO: can we trigger this without a timeout?
				setTimeout(async () => {
					await doGetLinkedEntries();
					setShowSpinner(false);
				}, 1500);
			} catch (e) {
				sdk.notifier.error("Error updating entry");
				console.log(e);
			} finally {
				setEntryStatus({ ...entryStatus, working: false });
			}
		} else {
			// Do a normal update
			const entry = await sdk.space.getEntry(entryId);
			// publish entry
			sdk.space
				.publishEntry(entry)
				.then((res) => {
					sdk.notifier.success("Entry updated");
				})
				.catch((err) => {
					switch (err.code) {
						case "UnresolvedLinks":
							sdk.notifier.error(
								"Couldn't update entry. Resolve missing links"
							);
							break;
						case "InvalidEntry":
							sdk.notifier.error(
								"Couldn't update entry. Complete required fields"
							);
							console.log("invalid entry error");
							console.log(err);
							break;

						default:
							sdk.notifier.error("Error updating entry");
							console.log(err);
					}
				})
				.finally(() => {
					setEntryStatus({ ...entryStatus, working: false });
				});
		}
	};

	function recursivelyReplaceLink(node, idToReplace, newId) {
		if (node.content && node.content.length > 0) {
			node.content.forEach((item) => {
				return recursivelyReplaceLink(item, idToReplace, newId);
			});
		} else {
			if (
				node.nodeType === "embedded-entry-block" ||
				node.nodeType === "embedded-entry-inline"
			) {
				if (node.data.target.sys.id === idToReplace) {
					node.data.target.sys.id = newId;
				}
			}

			return node;
		}
	}

	// reference fields include links and rich text
	function isReferenceField(field) {
		let result = false;
		//get value from field
		Object.keys(field).forEach((locale) => {
			const fieldValue = field[locale];
			if (Array.isArray(fieldValue)) {
				fieldValue.forEach((val) => {
					if (val.sys && val.sys.type === "Link") {
						result = true;
						return;
					}
				});
			} else {
				// check if single link or rich text
				if (fieldValue.nodeType === "document") {
					result = true;
					return;
				}

				if (fieldValue.sys && fieldValue.sys.type === "Link") {
					result = true;
					return;
				}
			}
		});

		return result;
	}

	// when the current entry changes:
	// store the last published version
	useEffect(() => {
		async function doGetPublishedEntries() {
			try {
				//get orininal entry
				const publishedEntries = await sdk.space.getPublishedEntries({
					"sys.id": entryId,
				});
				if (publishedEntries.total > 0) {
					const entry = publishedEntries.items[0];
					//update state
					setOriginalEntry(entry);
				}
			} catch (e) {
				console.log("error getting entry", e);
			}
		}
		doGetPublishedEntries();
	}, [sdk.space, sdk.entry, entryId]);

	// entry status tracking
	useEffect(() => {
		const detatchFunctions = [];
		detatchFunctions.push(sdk.entry.onSysChanged(sysChanged));

		function sysChanged(e) {
			const sys = sdk.entry.getSys();

			setEntryStatus({
				working: false,
				isDraft: !sys.publishedVersion,
				hasPendingChanges:
					sys.version > (sys.publishedVersion || 0) + 1,
				isPublished: sys.version === (sys.publishedVersion || 0) + 1,
				lastPublish: relativeDate(new Date(sys.updatedAt)),
			});
		}

		return () => {
			detatchFunctions.forEach((detatch) => detatch());
		};
	}, [sdk.entry]);

	//validate linked entries to update selection
	useEffect(() => {
		setValidSeclection(
			linkedEntries.length <= 1 ||
				(linkedEntries.length > 0 && linksToUpdate.length > 0)
		);
	}, [linkedEntries, linksToUpdate]);

	// find all the entries that link to this entry
	useEffect(() => {
		doGetLinkedEntries();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// keep `select all` in sync
	useEffect(() => {
		setSelectAll(
			linksToUpdate.length > 0 &&
				linksToUpdate.length === linkedEntries.length
		);
	}, [linksToUpdate, linkedEntries]);

	let result = null;

	if (linkedEntries.length > 1) {
		result = (
			<div>
				<h1>Warning:</h1>
				<h5>This entry is used in more than one place</h5>
				{!validSelection ? (
					<ValidationMessage>
						Select entries you want to update
					</ValidationMessage>
				) : null}
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
							<div
								key={entry.sys.id}
								style={{
									display: "flex",
									justifyContent: "space-between",
								}}
							>
								<CheckboxField
									labelText={entry.displayField}
									helpText={entry.sys.contentType.sys.id}
									name={entry.sys.id}
									id={entry.sys.id}
									checked={linksToUpdate.includes(
										entry.sys.id
									)}
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
								<Icon
									icon="ExternalLink"
									onClick={() => {
										const spaceId = entry.sys.space.sys.id;
										const entryId = entry.sys.id;
										const environmentId =
											entry.sys.environment.sys.id;
										const url = `https://app.contentful.com/spaces/${spaceId}/environments/${environmentId}/entries/${entryId}`;
										window.open(url, "_blank");
									}}
								/>
							</div>
						);
					})}
				</FieldGroup>
			</div>
		);
	}

	const renderStatusLabel = () => {
		if (entryStatus.isDraft) {
			return <span className="f36-color--warning">Draft</span>;
		}

		if (entryStatus.isPublished) {
			return <span className="f36-color--positive">Published</span>;
		}

		return (
			<span className="f36-color--primary">
				Published (pending changes)
			</span>
		);
	};
	return (
		<div>
			{showSpinner ? <Spinner /> : result}

			<Paragraph>
				<strong>Status: </strong>
				{renderStatusLabel()}
			</Paragraph>
			<Button
				className="f36-margin-top--s f36-margin-bottom--xs"
				buttonType="positive"
				onClick={() => {
					handlePublish();
				}}
				disabled={
					!validSelection ||
					entryStatus.working ||
					entryStatus.isPublished
				}
				loading={entryStatus.working}
				isFullWidth={true}
			>
				Publish
			</Button>
			<Paragraph>Last saved {entryStatus.lastPublish}</Paragraph>
		</div>
	);
}
export default Sidebar;
