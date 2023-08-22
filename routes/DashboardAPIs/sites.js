const Router = require('express');
const route = Router();
const axios = require('axios');
const dotenv = require("dotenv");
const moment = require('moment-timezone');
dotenv.config();
const fastcsv = require('fast-csv');


const fileSystem = require("fs");
const csv = require('csv-parser');
const pool = require('../../config/db');



route.get("/config", async (req, res, next) => {
    try {
        const email = req.query.email;
        const resJson = await pool.query('SELECT company FROM user_details WHERE user_email = $1', [email]);
        let company = await resJson.rows[0].company;

        let sitesQuery = await pool.query('SELECT * FROM utility_sites WHERE company = $1', [company])
        if (company === process.env.ADMIN_COMPANY) {
            sitesQuery = await pool.query('SELECT * FROM utility_sites');
        }

        const sitesArr = sitesQuery.rows;

        if (sitesArr.length === 0) {
            sitesArr.push({
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

        res.send(sitesArr);

    } catch (error) {
        console.error('Error fetching data from the API:', error);
        next(error);
    }
})



route.get('/data', async (req, res, next) => {
    try {
        var client = req.query.client;
        var site = req.query.site;
        if (client === 'Demo') client = process.env.DEMO_COMPANY;
        if (site === 'Demo-Site') site = process.env.DEMO_SITE;
        var timeframe = req.query.timeframe;
        let filepath = `/home/csv/${client}/${timeframe.toLowerCase()}/Solarad_${site}_${client}_${timeframe}.csv`;

        res.setHeader('Content-disposition', `attachment; filename=${filepath.split(`${timeframe.toLowerCase()}/`)[1]}`);
        res.setHeader('Content-type', 'text/csv');


        if (!fileSystem.existsSync(filepath)) {
            res.send("File not found");
            return;
        }

        const results = [];
        fileSystem.createReadStream(filepath)
            .pipe(csv())
            .on('headers', (headers) => {
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
        let headersToConcat = ['Time', 'GHI_ID(W/m2)', 'Ground GHI', 'Gen_ID(W/m2)', 'AC_POWER_SUM', 'POA(W/m2)', 'Ground POA'];

        for (let date = startDate; date.isSameOrBefore(endDate); date.add(1, 'days')) {
            let formattedDate = date.format(outputFormat);
            let filepath = `/home/Forecast/${client}/forecasts/Solarad_${site}_${client}_Forecast_${formattedDate}_ID.csv`;

            if (fileSystem.existsSync(filepath)) {
                const fileData = await new Promise((resolve, reject) => {
                    const rows = [];
                    fileSystem.createReadStream(filepath)
                        .pipe(csv())
                        .on('data', (row) => {

                            const filteredRow = {};
                            headersToConcat.forEach(header => {
                                filteredRow[header] = row[header];
                            });
                            rows.push(filteredRow);
                        })
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

        res.write(headersToConcat.join(',') + '\n');
        mergedData.forEach(row => {
            res.write(headersToConcat.map(header => row[header]).join(',') + '\n');
        });
        res.end();

    } catch (err) {
        console.log(err);
        next(err);
    }
});


route.get('/get-utility-sites', async (req, res) => {
    try {
        const queryResult = await pool.query('SELECT * FROM utility_sites')

        const csvStream = fastcsv.format({ headers: true })

        const headers = [
            'sitename', 'company', 'lat', 'lon', 'ele',
            'capacity', 'country', 'timezone', 'mount_config',
            'tilt_angle', 'ground_data_available',
            'show_ghi', 'show_poa', 'show_forecast'
        ];
        csvStream.write(headers);

        queryResult.rows.forEach(row => csvStream.write(row));
        csvStream.end();

        res.setHeader('Content-Disposition', 'attachment; filename="utility_sites.csv"');
        res.setHeader('Content-Type', 'text/csv');

        csvStream.pipe(res);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal Server Error');
    }
})

route.get('/get-residential-sites', async (req, res) => {
    try {
        const queryResult = await pool.query('SELECT * FROM residential_sites')

        const csvStream = fastcsv.format({ headers: true })

        const headers = [
            'sitename', 'company', 'lat', 'lon', 'ele',
            'capacity', 'country', 'timezone', 'mount_config',
            'tilt_angle', 'ground_data_available'
        ];
        csvStream.write(headers);

        queryResult.rows.forEach(row => csvStream.write(row));
        csvStream.end();

        res.setHeader('Content-Disposition', 'attachment; filename="utility_sites.csv"');
        res.setHeader('Content-Type', 'text/csv');

        csvStream.pipe(res);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal Server Error');
    }
})


route.get('/get-all-sites', async (req, res) => {
    try {
        const queryResult = await pool.query('SELECT DISTINCT user_email FROM user_details');
        const emails = queryResult.rows.map(row => row.user_email);

        let sites = [];
        for (let i = 0; i < emails.length; i++) {
            const email = emails[i];
            const company = await pool.query('SELECT company FROM user_details WHERE user_email = $1', [email]);
            let companySites = await pool.query('SELECT sitename FROM utility_sites WHERE company = $1', [company.rows[0].company]);
            if (company.rows[0].company === process.env.ADMIN_COMPANY) companySites = await pool.query('SELECT sitename FROM utility_sites');

            if (companySites.rows.length === 0) {
                companySites.rows.push({
                    sitename: 'Demo-Site'
                })
            }
            sites.push({
                email: email,
                company: company.rows[0].company,
                sites: companySites.rows.map(row => row.sitename)
            })

        }
        res.send(sites);

    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal Server Error');
    }
})


function convertToCsv(data) {
    const header = Object.keys(data[0]).join(',') + '\n';
    const rows = data.map((row) => Object.values(row).join(',') + '\n');
    return header + rows.join('');
}


module.exports = route;