import Route from '@ioc:Adonis/Core/Route'

/**
 * USER ROUTES
 */

Route.get('/user/profile', 'UsersController.profile').middleware('auth:api')
Route.post('/login', 'UsersController.login').middleware('validator:LoginValidator')

/**
 * COUNTRY ROUTES
 */

Route.get('/country', 'CountriesController.listCountries').middleware('auth:api')
