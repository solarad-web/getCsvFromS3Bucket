const Router = require('express');
const route = Router();
const axios = require('axios');
const dotenv = require("dotenv");
const moment = require('moment-timezone');
dotenv.config();

const fileSystem = require("fs");
const csv = require('csv-parser');
const pool = require('../../config/db');



route.get("/config", async (req, res, next) => {
    try {
        //if email is equal to bhramar@solarad.ai, then put the sites and client name together
        const email = req.query.email;
        const resJson = await pool.query('SELECT company FROM user_details WHERE user_email = $1', [email]);
        let company = await resJson.rows[0].company;

        // Make an HTTP request to the external API
        let filepath = `/home/utility-sites`;

        const sites = [];

        // Check if the file exists
        if (!fileSystem.existsSync(filepath)) {
            res.send("File not found");
            return; // Exit the function early
        }

        // Process the CSV data
        fileSystem.createReadStream(filepath)
            .pipe(csv())
            .on('data', (row) => {
                // Check if the row has the company name
                if (company === process.env.ADMIN_COMPANY) {
                    sites.push({
                        'company': row.company,
                        'site': row.sitename,
                        'ground_data_available': row.ground_data_available,
                        'show_ghi': row.show_ghi,
                        'show_poa': row.show_poa,
                        'show_forecast': row.show_forecast,
                        'lat': row.lat,
                        'lon': row.lon
                    });
                }
                else if (row.company === company) {
                    sites.push({
                        'company': row.company,
                        'site': row.sitename,
                        'ground_data_available': row.ground_data_available,
                        'show_ghi': row.show_ghi,
                        'show_poa': row.show_poa,
                        'show_forecast': row.show_forecast,
                        'lat': row.lat,
                        'lon': row.lon
                    });
                }
            })
            .on('end', () => {
                if (sites.length === 0) {
                    sites.push({
                        'company': 'Demo',
                        'site': 'Demo-Site',
                        'ground_data_available': 'True',
                        'show_ghi': 'True',
                        'show_poa': 'False',
                        'show_forecast': 'True',
                        'lat': '28.7041',
                        'lon': '77.1025'
                    })
                }
                res.send(sites); // Send the filtered CSV data as the response
            });

    } catch (error) {
        console.error('Error fetching data from the API:', error);
        next(error);
    }
});



route.get('/data', async (req, res, next) => {
    try {
        var client = req.query.client;
        var site = req.query.site;
        if (client === 'Demo') client = process.env.DEMO_COMPANY;
        if (site === 'Demo-Site') site = process.env.DEMO_SITE;
        var timeframe = req.query.timeframe;
        let filepath = `/home/csv/${client}/${timeframe.toLowerCase()}/Solarad_${site}_${client}_${timeframe}.csv`;

        //set the headers for the response as the original filename
        res.setHeader('Content-disposition', `attachment; filename=${filepath.split(`${timeframe.toLowerCase()}/`)[1]}`);
        res.setHeader('Content-type', 'text/csv');


        // Check if the file exists
        if (!fileSystem.existsSync(filepath)) {
            res.send("File not found");
            return; // Exit the function early
        }

        const results = [];
        fileSystem.createReadStream(filepath)
            .pipe(csv())
            .on('headers', (headers) => {
                // Check if the specified column exists in the CSV file
                if (headers.includes(`Time`)) {
                    if (timeframe === "Daily") headers[headers.indexOf('Time')] = `Date`;
                    else if (timeframe === "Monthly") headers[headers.indexOf('Time')] = `Month`;
                }
            })
            .on('data', (data) => {
                results.push(data);
            })
            .on('end', () => {
                const modifiedCsv = convertToCsv(results);
                // Create a new CSV file with modified data

                // Send back the modified CSV file
                res.send(modifiedCsv);
            });
    } catch (err) {
        console.log(err);
        next(err);
    }
})


route.get('/getforecast', async (req, res, next) => {
    try {
      var client = req.query.client;
      var site = req.query.site;
      const startDate = moment(req.query.startDate, 'ddd MMM DD YYYY HH:mm:ss [GMT]ZZ (z)');
      const endDate = moment(req.query.endDate, 'ddd MMM DD YYYY HH:mm:ss [GMT]ZZ (z)');
      const outputFormat = 'YYYY-MM-DD';
  
      if (client === 'Demo') client = process.env.DEMO_COMPANY;
      if (site === 'Demo-Site') site = process.env.DEMO_SITE;
  
      let mergedData = [];
      let headers;
  
      for (let date = startDate; date.isSameOrBefore(endDate); date.add(1, 'days')) {
        let formattedDate = date.format(outputFormat);
        let filepath = `/home/Forecast/${client}/forecasts/Solarad_${site}_${client}_Forecast_${formattedDate}_ID.csv`;
  
        if (fileSystem.existsSync(filepath)) {
          const fileData = await new Promise((resolve, reject) => {
            const rows = [];
            fileSystem.createReadStream(filepath)
              .pipe(csv())
              .on('headers', (header) => {
                if (!headers) headers = header;
              })
              .on('data', (row) => rows.push(row))
              .on('end', () => resolve(rows))
              .on('error', reject);
          });
  
          mergedData = mergedData.concat(fileData);
        }
      }
  
      if (mergedData.length === 0) {
        res.send("Files not found");
        return;
      }
  
      res.setHeader('Content-disposition', `attachment; filename=Solarad_${site}_${client}_Forecast_Merged.csv`);
      res.setHeader('Content-type', 'text/csv');
  
      res.write(headers.join(',') + '\n'); // Write the headers
      mergedData.forEach(row => {
        res.write(Object.values(row).join(',') + '\n'); // Write the data
      });
      res.end();
  
    } catch (err) {
      console.log(err);
      next(err);
    }
  });


// Helper function to convert data to CSV format
function convertToCsv(data) {
    const header = Object.keys(data[0]).join(',') + '\n';
    const rows = data.map((row) => Object.values(row).join(',') + '\n');
    return header + rows.join('');
}


module.exports = route;