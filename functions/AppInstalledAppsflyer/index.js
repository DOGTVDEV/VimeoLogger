/**
 * Responds to any HTTP request.
 *
 * @param {!express:Request} req HTTP request context.
 * @param {!express:Response} res HTTP response context.
 */
const mysql = require('mysql');
const axios = require('axios');

const env = {
	...env.variables.secrets
}

const appsFlyerEnv = {
   "ios": {
      "url": 'https://api2.appsflyer.com/inappevent/id713206884',
      "auth": 'XhwhkKgzWhCsS8oVqkX9Eb'
   },
   "android":{
      "url": 'https://api2.appsflyer.com/inappevent/com.latto.tv.dogtv',
      "auth": 'XhwhkKgzWhCsS8oVqkX9Eb'
   }
}

const pool = mysql.createPool(env);


function updateUser (payload, _res) {
   try{
    const query = `UPDATE vimeo.user SET appsflyer_id = '${payload.appsflyer_id}', bundle_id = '${payload.bundle_id}', af_cost_value = '${payload.af_cost_value}', af_cost_model = '${payload.af_cost_model}', install_time = '${payload.install_time}', attributed_touch_type = '${payload.attributed_touch_type}', api_version = '${payload.api_version}', attributed_touch_time = '${payload.attributed_touch_time}', media_source = '${payload.media_source}', campaign = '${payload.campaign}', event_time = '${payload.event_time}' WHERE ${payload.idfv ? `device_id = '${payload.idfv}'` : `advertisingId = '${payload.advertising_id}'`};`;

    pool.query(query, [], (error, result) => {
       if (error){
         console.log(`Data didn't save to DB: ${error}`);
         _res.status(404).send(error);
       } else {
          getUser(payload, sendToAppsFlyer, _res);
       }
    });
   }
   catch(error) {
      _res.json({status: "Erorr", error: error});
   }
}

function getUser(payload, fun, _res){

   try{
      pool.query(`SELECT * FROM vimeo.user WHERE ${payload.idfv ? `device_id = '${payload.idfv}'` : `advertisingId = '${payload.advertising_id}'`};`, [], (err, res)=> {
         if(err || !res.length){ throw err } 
         else { fun(res[0], _res) }
      });
   } catch (error) {
      console.log(`ERROR: User not found ${id}, error: ${error.stack}`)
      _res.status(200).send('Wrong data');
   }
}


function sendToAppsFlyer(user, _res){
   try {
      const envByType = appsFlyerEnv[user.device_type];
      const data = {
            "appsflyer_id": user.appsflyer_id,
            "eventTime" : user.event_time,
            "bundle_id": user.bundle_id,
            "idfv": user.device_id,
            "uid": user.anonymousId,
            "os": user.os_name,
            "ip": user.ip,
            "advertising_id": user.advertisingId,
            "eventName": "DOGTV_app_installed",
            "eventValue": { 
               "device": user.device_name,
               "device_id": user.device_id,
               "name": "DOGTV_app_installed",
               "platform": user.platform,
               "platform_id":user.platform_id,
               "platform_version":user.platform_version,
               "product_id":user.product_id,
               "session_id":user.session_id,
               "site_id":user.site_id,
               "timestamp":user.timestamp,
               "type":user.type
            }
      }

      axios({
         method: 'post',
         url: envByType.url,
         headers: {
            'authentication': envByType.auth,
            'Content-Type': 'application/json'
         },
         data: data
      })
      .then((data)=> {
         console.dir(data); console.log('sendToAppsFlyer Request is sent');
      })

   } catch (error) {
      console.log(`ERROR: issue with send data to appsFlyer ${ error.stack }`);
      _res.status(200).send('Wrong data');
   }

   _res.status(200).send('Success');
}


exports.init = (req, res) => {
  if(req.body.event_name = 'install') {
    updateUser(req.body, res);
  } else {
    res.status(200).send('Wrong event');
  }
};
