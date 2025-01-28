#!/usr/bin/env node

const { google } = require("googleapis");
const axios = require("axios");
const fs = require("fs");
const readline = require("readline");

const { victorOpsApiKey, victorOpsOrgId } = JSON.parse(
  fs.readFileSync("./config.json")
);

// Path to your service account key file
const SERVICE_ACCOUNT_FILE = "./verdant-bus-448911-r5-98dfe5176d5a.json";
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

// Authenticate and initialize Sheets API client
const auth = new google.auth.GoogleAuth({
  keyFile: SERVICE_ACCOUNT_FILE,
  scopes: SCOPES,
});

// Initialize Google Sheets API
const sheets = google.sheets({
  version: "v4",
  auth,
});

//Function to fetch team list from VictorOps API
async function getTeamsList() {
  try {
    const response = await axios.get(
      `https://api.victorops.com/api-public/v1/team`,
      {
        headers: {
          "X-VO-Api-Id": victorOpsOrgId,
          "X-VO-Api-Key": victorOpsApiKey,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error(`Error fetching team list`, error.message);
    return "Error";
  }
}

// Function to fetch on-call user from VictorOps API
async function getOnCallUser(team, time) {
  try {
    const response = await axios.get(
      `https://api.victorops.com/api-public/v2/team/${team}/oncall/schedule`,
      {
        headers: {
          "X-VO-Api-Id": victorOpsOrgId,
          "X-VO-Api-Key": victorOpsApiKey,
        },
      }
    );

    const schedules = response.data.schedules || [];
    return schedules.length ? schedules : "No on-call users found";
  } catch (error) {
    console.error(
      `Error fetching on-call user for team ${team}:`,
      error.message
    );
    return "Error";
  }
}

// Main function to populate the Google Sheet
async function populateSheet(sheetId) {
  try {
    // Read sheet data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Sheet1!A1:D", // Assuming data starts at A1
    });

    const rows = response.data.values;
    const headers = rows[0];

    if (
      !headers.includes("Date") ||
      !headers.includes("Time") ||
      !headers.includes("Team")
    ) {
      console.error('Sheet must include "Date", "Time", and "Team" columns.');
      return;
    }

    const usernameColumnIndex = headers.indexOf("Username");
    if (usernameColumnIndex === -1) headers.push("Username"); // Add "Username" header if not present

    const updatedRows = [headers];

    //Get the team list
    let teamList = await getTeamsList();

    // Write updated data back to Google Sheets
    for (let i = 0; i < teamList.length; i++) {
      let response = await getOnCallUser(teamList[i]["slug"]);
      for (let j = 0; j < response.length; j++) {
        for (let k = 0; k < response[j]["schedule"].length; k++) {
          if (response[j]["schedule"][k]["rolls"].length > 0) {
            for (
              let l = 0;
              l < response[j]["schedule"][k]["rolls"].length;
              l++
            ) {
              updatedRows.push([
                new Date(
                  response[j]?.["schedule"]?.[k]?.["rolls"]?.[l]?.["start"]
                ).toLocaleDateString(),
                new Date(
                  response[j]?.["schedule"]?.[k]?.["rolls"]?.[l]?.["end"]
                ).toLocaleTimeString(),
                teamList[i]?.["name"],
                response[j]?.["schedule"]?.[k]?.["rolls"]?.[l]?.[
                  "onCallUser"
                ]?.["username"].toString(),
              ]);
            }
          }
        }
      }
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: "Sheet1!A1",
      valueInputOption: "RAW",
      requestBody: {
        values: updatedRows,
      },
    });

    console.log("Google Sheet updated successfully.");
  } catch (error) {
    console.error("Error updating the Google Sheet:", error.message);
  }
}

// populateSheet("1wqb96scbyDL4Q4snqaA3lwc_G65FNgK8lK1HLO5N9is");
// Get arguments from the command line
// const args = process.argv.slice(2);

// if (args.length === 0) {
//   console.log("Please provide the google sheet ID.");
//   process.exit(1);
// }

// populateSheet(args);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Please provide the google sheet ID ", (id) => {
  rl.close();
  populateSheet(id);
});
