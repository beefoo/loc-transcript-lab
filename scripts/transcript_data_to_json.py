"""Script exporting transcript data as JSON"""

# -*- coding: utf-8 -*-

import argparse

from utilities import *

# Arguments
def parseArgs():
    """Function to parse script arguments"""

    # pylint: disable=line-too-long
    parser = argparse.ArgumentParser()
    parser.add_argument("-in", dest="TRANSCRIPT_INPUT_FILE", default="data/output/mary-church-terrell-advocate-for-african-americans-and-women_2023-01-20_with-dates.csv", help="A BtP dataset file. You can download these via script `get_transcript_data.py`")
    parser.add_argument("-filter", dest="FILTER", default="", help="Filter query string; leave blank if no filter")
    parser.add_argument("-fields", dest="FIELDS", default="ResourceID,Item,DownloadUrl,Transcription,ItemAssetIndex,Project,EstimatedYear", help="Comma-separated list of fields to output")
    parser.add_argument("-group", dest="GROUP_FIELDS", default="ResourceID,Item,Project", help="Comma-separated list of fields that we should try to group together in the output b/c they have non-unique values")
    parser.add_argument("-out", dest="OUTPUT_FILE", default="public/data/mary-church-terrell/transcripts.json", help="Output JSON file")
    args = parser.parse_args()
    return args

def main(a):
    """Main function to output transcript data as JSON"""

    # Make sure output dirs exist
    makeDirectories(a.OUTPUT_FILE)

    # Read data from .csv file
    fieldnames, pages = readCsv(a.TRANSCRIPT_INPUT_FILE)

    # Filter data if necessary
    if len(a.FILTER) > 0:
        pages = filterByQueryString(pages, a.FILTER)

    # Parse columns and groups
    cols = [field.strip() for field in a.FIELDS.split(",")]
    cols = [field for field in cols if field in fieldnames]
    colGroups = [field.strip() for field in a.GROUP_FIELDS.split(",")]
    colGroups = [field for field in colGroups if field in fieldnames]

    for i, row in enumerate(pages):
         # Make the download URL shorter
        if "DownloadUrl" in cols:
            # e.g. http://tile.loc.gov/image-services/iiif/service:mss:mss42549:mss42549-002:00324/full/pct:100/0/default.jpg
            url = row["DownloadUrl"]
            url = url.replace("http://tile.loc.gov/image-services/iiif/", "")
            url = url.replace("/full/pct:100/0/default.jpg", "")
            pages[i]["DownloadUrl"] = url
        if "EstimatedYear" in cols:
            pages[i]["EstimatedYear"] = int(row["EstimatedYear"]) if row["EstimatedYear"] != "" else ""
        if "ItemAssetIndex" in cols:
            pages[i]["ItemAssetIndex"] = int(row["ItemAssetIndex"])

    rows, groups = unzipList(pages, cols, colGroups)

    # Write JSON to file
    jsonOut = {
        "cols": cols,
        "rows": rows,
        "groups": groups
    }
    writeJSON(a.OUTPUT_FILE, jsonOut)

main(parseArgs())
