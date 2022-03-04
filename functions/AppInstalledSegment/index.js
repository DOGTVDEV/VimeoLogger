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

function dbCallback (res, errorText, errorData, next, errorCase) {
   return (error, data) => {
      const isObject = typeof data === 'object' && !Array.isArray(data) && !data.affectedRows;
      const isArray = Array.isArray(data) && !data[0];

      if(!!error || isObject || isArray) {
         if(errorCase) { errorCase() }
         else {
            console.log('DB error ', errorText, typeof errorData === 'string' && errorData, error);
            if(errorData) console.dir(errorData);
            res.json({status: `DB error ${errorText}`, error: error}); 
         }
      }
      else if (next) {
        next(data);
      } 
      else {
         console.dir(error);
         res.json({status : "success", data: data});
      };
   }
}


function sendToAppsFlyer(user, plan, payload, res){
   try {
      const envByType = appsFlyerEnv[user.device_type];

      const data = {
            "appsflyer_id": user.appsflyer_id,
            "eventTime" : payload.timestamp,
            "bundle_id": user.bundle_id,
            "idfv": user.device_id,
            "uid": user.anonymousId,
            "os": user.os_name,
            "ip": user.ip,
            "advertising_id": user.advertisingId,
            "eventName": `DOGTV_order_completed_${plan}`,
            "eventValue": { 
               ...payload.properties,
               "name": `DOGTV_order_completed_${plan}`
               }
      };

      axios({
         method: 'post',
         url: envByType.url,
         headers: {
            'authentication': envByType.auth,
            'Content-Type': 'application/json',
            'User-Agent': "DOGTV"
         },
         data: data
      })
      .then(() => { console.log('AppsFlyer data sent') });

   } catch (error) {
      console.dir(error);
      res.json({status: "DB error: issue sendToAppsFlyer", error: error});
   }

   res.json({status : "success", error: { message: "before request to AppsFlyer" }});
}

function getPlan(user, payload, fun, res){
   try{
      const query = `SELECT frequency FROM vimeo.logger WHERE email = '${user.email}' AND topic = 'customer.product.created';`;
      const next = (data) => fun(user,  data ? data[0]['frequency'] : '', payload, res);
      const callback = dbCallback(res, 'getPlan, no frequency for user in logger', user.email, next, next );

      pool.query(query, [], callback);
   } catch (error) {
      console.dir(error);
      res.json({status: "DB error: getPlan, internall error", error: error});
   }
}


function getUser(id, payload, fun, res){
   try{
      const query = `SELECT * FROM vimeo.user WHERE device_id = '${id}';`;
      const next = (data) => getPlan(data[0], payload, fun, res);
      const callback = dbCallback( res, 'getUser get user from vimeo.user failed', id, next);

      pool.query(query, [], callback);
   } catch (error) {
      console.dir(error);
      res.json({status: "DB error: getUser internall error", error: error});
   }
}

function orderCompleted (payload, res) {
   try {
      const id = payload.context.device.id;
      const query = `UPDATE vimeo.user SET order_completed = 1 WHERE device_id = '${id}';`;
      const callback = dbCallback(res, 'orderCompleted update user failed', '', () => getUser(id, payload, sendToAppsFlyer, res) );

      pool.query( query, [], callback());
   } catch (error) {
      console.dir(error);
      res.json({status: "DB error: orderCompleted update user failed", error: error});
   }
} 

function accountCreated (payload, res) {
   try {
      const id = payload.context.device.id;
      const query = `UPDATE vimeo.user SET email = '${payload.properties.user_email}' WHERE device_id = '${id}';`;
      const errorCase = () => { newInstall(payload, res) };
      const callback =  dbCallback(res, 'accountCreated update user failed', payload.properties.user_email, false, errorCase);

      pool.query( query, [], callback );
   } catch (error) {
      console.dir(error);
      res.json({status: "DB error: accountCreated update user failed", error: error});
   }
} 

function newInstall (payload, res){
   try {
    const query = "INSERT INTO vimeo.user VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    const data = [
         payload.anonymousId,
         payload.context.device.id,
         payload.context.device.advertisingId || null,
         payload.context.device.manufacturer,
         payload.context.device.model,
         payload.context.device.name,
         payload.context.device.type,
         payload.context.externalIds.collection,
         payload.context.externalIds.encoding,
         payload.context.externalIds.type,
         payload.context.ip,
         payload.context.locale,
         payload.context.os.name,
         payload.context.os.version,
         payload.context.timezone,
         payload.context.userAgent,
         payload.messageId,
         payload.originalTimestamp,
         payload.properties.platform,
         payload.properties.platform_id,
         payload.properties.platform_version,
         payload.properties.product_id,
         payload.properties.session_id,
         payload.properties.site_id,
         payload.properties.timestamp,
         payload.properties.type,
         payload.properties.view
      ];
      data.length = 40;

      if(payload.properties.user_email) {
         data[38] = payload.properties.user_email;
      }

      const callback = dbCallback(res, 'newInstall create user failed', data);

      pool.query( query, data, callback);
   }
   catch(error){
      console.dir(error);
      res.json({status : "DB error: newInstall create user failed", error: error});
   }
}

exports.init = (req, res) => {
  if (req.body.event === "Order Completed"){
    orderCompleted(req.body, res);
  } 
  else if (req.body.event === "App Installed"){
    newInstall(req.body, res);
  } 
  else if (req.body.event === "Account Created" && req.body.properties?.user_email) {
    accountCreated(req.body, res);
  }
  else{
    res.status(200).send('wrong event');  
  }

};

